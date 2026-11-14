import asyncio
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from raw_server import RawServer

class RawTests(unittest.TestCase):
    def test_relative_timestamp_raw_counts_and_bounded_queue(self):
        server = RawServer({})
        queue = asyncio.Queue(maxsize=2)
        server.clients.add(queue)
        for seq in range(5):
            server.publish([(seq, server.origin+123000, (1,2,3,4,5,6))])
        self.assertEqual(queue.qsize(), 2)
        message = json.loads(queue.get_nowait())
        self.assertEqual(message['samples'], [[3,123,1,2,3,4,5,6]])
        self.assertEqual(server.hello()['mode'], 'real')

class RawSocketTests(unittest.IsolatedAsyncioTestCase):
    async def test_handshake_ping_shared_reset_and_samples(self):
        from websockets.asyncio.client import connect
        from websockets.asyncio.server import serve
        source = RawServer({'bias_seconds': 3})
        async with serve(source.handle, '127.0.0.1', 0) as server:
            url = f'ws://127.0.0.1:{server.sockets[0].getsockname()[1]}/ws'
            async with connect(url) as a, connect(url) as b:
                hello = json.loads(await a.recv())
                self.assertEqual(hello, json.loads(await b.recv()))
                await a.send('{"cmd":"ping","t":12}')
                pong = json.loads(await a.recv())
                self.assertEqual(pong['t'], 12)
                self.assertGreaterEqual(pong['us'], 0)
                await a.send('{"cmd":"reset"}')
                reset = json.loads(await a.recv())
                self.assertEqual(reset, json.loads(await b.recv()))
                self.assertNotEqual(reset['e'], hello['e'])
                source.publish([(0, source.origin+1000, (1,2,3,4,5,6))])
                sample = json.loads(await a.recv())
                self.assertEqual(sample, json.loads(await b.recv()))
                self.assertEqual(sample['e'], reset['e'])
                self.assertEqual(sample['samples'][0], [0,1000//1000,1,2,3,4,5,6])
