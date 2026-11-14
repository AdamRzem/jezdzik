import { Fusion } from '../imu';
let fusion: Fusion;
let epoch: number;
self.onmessage = ({ data }) => {
	if (data.type === 'hello') {
		fusion = new Fusion(data.imu);
		epoch = data.e;
	} else if (data.type === 'imu' && fusion && data.e === epoch) {
		const history = data.samples.map((s: number[]) => fusion.sample(s)).filter(Boolean);
		self.postMessage({ e: epoch, history: fusion.ready ? history : [], clear: !fusion.ready });
	}
};
