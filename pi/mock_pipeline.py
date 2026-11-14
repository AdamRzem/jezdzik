"""Synthetic sensor data on the normal rover wire protocols.

REAL DATA INPUT: replace this producer with timestamped camera/IMU/VO adapters.
Video pixels travel through FFmpeg/MediaMTX; only poses travel over /ws.
"""

import math
from collections import OrderedDict
from dataclasses import dataclass

from camera import Frame, stamp_levels
from imu import Orientation
from vo import StubVO

# Known scene geometry is private to the mock camera, never sent as detections.
ITEMS = (
    {"id": 0, "x": -0.14, "z": -0.85, "yaw": math.pi + 0.2},
    {"id": 1, "x": 0.23, "z": -1.38, "yaw": math.pi - 0.3},
    {"id": 2, "x": -0.22, "z": -2.12, "yaw": math.pi + 0.5},
)


class MockTracking(StubVO):
    """Exercise returned observations and immutable anchors, without sensor fusion."""

    def __init__(self, history_frames):
        super().__init__(history_frames)
        self.anchors = {}
        self.observations = OrderedDict()

    def reset(self):
        super().reset()
        self.anchors.clear()
        self.observations.clear()

    def observe(self, command):
        if not self.valid_observation(command):
            return False
        key = (command["e"], command["f"], command["item"])
        if key in self.observations:
            return False
        pose = self.history[command["f"]]
        c, s = math.cos(pose["yaw"]), math.sin(pose["yaw"])
        anchor = {"x": pose["x"] + c * command["right"] - s * command["forward"],
                  "z": pose["z"] - s * command["right"] - c * command["forward"],
                  "yaw": pose["yaw"] + command["yaw"]}
        if not all(math.isfinite(value) for value in anchor.values()):
            return False
        self.anchors.setdefault(command["item"], anchor)
        self.observations[key] = anchor
        while len(self.observations) > self.history_frames * 12:
            self.observations.popitem(last=False)
        # REAL DATA INPUT: use anchor residuals to correct measured VO drift.
        # Synthetic ground truth has no drift, so it needs no correction.
        return True


@dataclass(frozen=True)
class Capture:
    frame: Frame
    pose: dict
    rgb: bytes


class MockPipeline:
    def __init__(self, settings: dict, history_frames: int):
        # Optional mock-only dependencies; legacy stub mode stays lightweight.
        import cv2
        import numpy as np

        self.cv, self.np = cv2, np
        self.settings = settings
        self.vo = MockTracking(history_frames)
        self.started_ns = None
        self.width, self.height = settings["width"], settings["height"]
        dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
        self.markers = {i: cv2.aruco.generateImageMarker(dictionary, i, 128)
                        for i in range(12)}
        # Rays sampled at 1/4 resolution for the procedural floor only.
        y, x = np.mgrid[0:self.height:4, 0:self.width:4]
        self.rx = (x + 2 - settings["cx"]) / settings["fx"]
        self.ry = -(y + 2 - settings["cy"]) / settings["fy"]

    def reset(self):
        self.vo.reset()
        self.started_ns = None

    def capture(self, frame: Frame) -> Capture:
        if self.started_ns is None:
            self.started_ns = frame.pose_time_ns
        t = (frame.pose_time_ns - self.started_ns) / 1e9
        # REAL DATA INPUT (IMU): interpolate fused attitude at frame.pose_time_ns.
        orientation = Orientation(yaw=0.035 * math.sin(t * 0.5))
        pose = self.vo.update(frame, orientation)
        # REAL DATA INPUT (VO): measured position in metres, Y-up, -Z forward.
        # q=2 here is synthetic confidence; the video is visibly watermarked.
        pose.update(x=0.025 * math.sin(t * 0.4), z=-0.04 * (1 - math.cos(t * 0.3)), q=2)
        # REAL DATA INPUT (CAMERA): pixels from the SAME capture as the pose.
        return Capture(frame, pose, self.image(pose))

    def project(self, points, pose):
        np, s = self.np, self.settings
        points = np.asarray(points, dtype=float)
        dx, dy, dz = (points - [pose["x"], s["height_m"], pose["z"]]).T
        c, sn = math.cos(pose["yaw"]), math.sin(pose["yaw"])
        x, z = c * dx - sn * dz, sn * dx + c * dz
        tilt = math.radians(s["tilt_deg"])
        y, z = math.cos(tilt) * dy - math.sin(tilt) * z, math.sin(tilt) * dy + math.cos(tilt) * z
        depth = -z
        pixels = np.column_stack((s["fx"] * x / depth + s["cx"],
                                  s["fy"] * -y / depth + s["cy"]))
        return pixels.astype(np.float32), depth

    def image(self, pose):
        np, cv, s = self.np, self.cv, self.settings
        tilt = math.radians(s["tilt_deg"])
        ry = self.ry * math.cos(tilt) - math.sin(tilt)
        rz = -self.ry * math.sin(tilt) - math.cos(tilt)
        distance = np.where(ry < -1e-9, s["height_m"] / np.maximum(-ry, 1e-9), 50).clip(0, 50)
        c, sn = math.cos(pose["yaw"]), math.sin(pose["yaw"])
        wx = pose["x"] + (c * self.rx + sn * rz) * distance
        wz = pose["z"] + (-sn * self.rx + c * rz) * distance
        checker = (np.floor(wx * 5) + np.floor(wz * 5)).astype(int) % 2
        small = np.where(checker[..., None] != 0, [168, 143, 103], [191, 166, 126]).astype(np.uint8)
        small[distance >= 50] = [105, 120, 125]
        image = cv.resize(small, (self.width, self.height), interpolation=cv.INTER_LINEAR)
        faces = []
        up = np.array([0., 1., 0.])
        camera = np.array([pose["x"], s["height_m"], pose["z"]])
        for item in ITEMS:
            center = np.array([item["x"], .05, item["z"]])
            # Each cube face uses the same ID/yaw convention as markerToItem.
            for face in range(4):
                angle = item["yaw"] + face * math.pi / 2
                normal = np.array([-math.sin(angle), 0., -math.cos(angle)])
                right = np.array([-math.cos(angle), 0., math.sin(angle)])
                face_center = center + normal * .05
                if np.dot(normal, camera - face_center) <= 0:
                    continue
                corners = np.array([face_center - right*.05 + up*.05,
                                    face_center + right*.05 + up*.05,
                                    face_center + right*.05 - up*.05,
                                    face_center - right*.05 - up*.05])
                marker_corners = np.array([face_center - right*.04 + up*.04,
                                           face_center + right*.04 + up*.04,
                                           face_center + right*.04 - up*.04,
                                           face_center - right*.04 - up*.04])
                polygon, depth = self.project(corners, pose)
                marker_polygon, _ = self.project(marker_corners, pose)
                if np.all(depth > .05):
                    faces.append((float(depth.mean()), polygon, marker_polygon, item["id"]*4+face))
            angle = item["yaw"]
            right = np.array([-math.cos(angle), 0., math.sin(angle)])
            normal = np.array([-math.sin(angle), 0., -math.cos(angle)])
            top_center = center + up * .05
            top = np.array([top_center - right*.05 - normal*.05,
                            top_center + right*.05 - normal*.05,
                            top_center + right*.05 + normal*.05,
                            top_center - right*.05 + normal*.05])
            polygon, depth = self.project(top, pose)
            if np.all(depth > .05):
                faces.append((float(depth.mean()), polygon, None, None))
        for _, polygon, marker_polygon, marker_id in sorted(faces, key=lambda f: -f[0]):
            cv.fillConvexPoly(image, polygon.astype(np.int32), (223, 220, 200))
            if marker_id is None:
                continue
            source = np.array([[0, 0], [127, 0], [127, 127], [0, 127]], dtype=np.float32)
            transform = cv.getPerspectiveTransform(source, marker_polygon)
            marker = cv.warpPerspective(self.markers[marker_id], transform,
                                        (self.width, self.height), flags=cv.INTER_NEAREST,
                                        borderValue=255)
            mask = np.zeros((self.height, self.width), dtype=np.uint8)
            cv.fillConvexPoly(mask, marker_polygon.astype(np.int32), 255)
            image[mask != 0] = marker[mask != 0, None]
        # Truth travels inside the camera data, without changes to the website.
        cv.rectangle(image, (16, self.height-46), (590, self.height-10), (16, 16, 16), -1)
        cv.putText(image, "SIMULATED CAMERA / NO HARDWARE", (26, self.height-21),
                   cv.FONT_HERSHEY_SIMPLEX, .75, (235, 235, 235), 2)
        for block, level in enumerate(stamp_levels(pose["f"])):
            image[:16, block*16:(block+1)*16] = level
        return image.tobytes()
