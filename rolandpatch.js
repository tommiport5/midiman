/**
 * Class RolandPatch
 * manages patches on a Roland Synthesizer
 * the 3byte notation is MSB, middle septet, LSB
 */
 
Sysex = require('./sysex.js');

const _rochar = " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890-";
const _WSD = 0x40;
const _RQD = 0x41;
const _DAT = 0x42;
const _ACK = 0x43;
const _EOD = 0x45;
const _RJC = 0x4f;

const FillState = Object.freeze ({
	up1: 1,
	up2: 2,
	upc: 3,
	lp1: 4,
	lp2: 5,
	lpc: 6,
	pd: 7
});
 
module.exports = class RolandPatch {
	constructor(MIn, MOut, MChan) {
		this.mIn = MIn;
		this.mOut = MOut;
		this.mChan = MChan;
	}
	
	
	static toStr(arr) {
		var res = "";
		arr.forEach((c) => {
			if (c < 64) {
				res += _rochar[c];
			}
		});
		return res;
	}
	
	get patchname() {
		if (this.pd == undefined) {
			return "<undefined>";
		} else {
			return RolandPatch.toStr(this.pd.slice(0,18));
		}
	}
	
	get tonenames() {
		if (this.lpc == undefined || this.upc == undefined) {
			console.log((this.lpc == undefined).toString() + ", " + (this.upc == undefined).toString());
			throw ReferenceError;
		}
		return [RolandPatch.toStr(this.upc.slice(0,10)), RolandPatch.toStr(this.lpc.slice(0,10))];
	}

	static patch2mem(bank, pn) {
		return RolandPatch.threebyte2num([2,0,0]) + (bank*8+pn)*448;
	}
	
	static threebyte2num(arr) {
		return 0x80*(0x80*arr[0] + arr[1]) + arr[2];
	}
			
	static num2threebyte(num) {
		var res = [0,0,0];
		var n = Math.round(num);
		res[2] = num % 0x80;
		res[1] = Math.trunc(n/0x80 % 0x80);
		res[0] = Math.trunc(n/(0x80*0x80) % 0x80);
		return res;
	}
	
	/**
	 *readFromSynth
	 * reads one patch into this object
	 */
	readFromSynth(bank, pnum) {
		var This = this;
		return new Promise((resolve,reject) => {
			try {
				var rd = new Sysex();
				var ds = new Sysex();
				var ack = new Sysex();
				var Ret = ds.listen(This.mIn);
				rd.brand = 0x41;
				rd.channel = This.mChan;
				rd.model = 0x14;
				rd.command = _RQD;
				rd.append(RolandPatch.num2threebyte(RolandPatch.patch2mem(bank, pnum)));		
				rd.append(RolandPatch.num2threebyte(448));
				console.log("sending >>" + rd.sendData + "<<");
				rd.send(This.mOut);
				Ret.then((sx) => {
					//if (sx.command == _RJC) throw "rejected";
					let add = sx.raw.slice(0,3);
					let sxd = sx.raw.slice(3);
					console.log("received " + sxd.length + " byte for address " + add);
					This.up1 = sxd.slice(0,64);
					This.up2 = sxd.slice(64,128);
					This.upc = sxd.slice(128,192);
					This.lp1 = sxd.slice(192);
					Ret = ds.listen(This.mIn);
					ack.brand = 0x41;
					ack.channel = This.mChan;
					ack.model = 0x14;
					ack.command = _ACK;
					console.log("sending >>>" + ack.sendData + "<<");
					ack.send(This.mOut);
					return Ret;
				}).then((sx) =>{
					//if (sx.command == _RJC) throw "rejected";
					console.log("received command: " + sx.command);
					let add = sx.raw.slice(0,3);
					let sxd = sx.raw.slice(3);
					console.log("received " + sxd.length + " byte for address " + add);
					This.lp2 = sxd.slice(0,64);
					This.lpc = sxd.slice(64,128);
					This.pd = sxd.slice(128);
					Ret = ds.listen(This.mIn);
					ack.send(This.mOut);
					return Ret;
				}).then((sx) =>{
					console.log("received command: " + sx.command);
					ack.send(This.mOut);
					resolve("ok");
					return Ret;
				}).catch((tmo) => {
					console.log('failure in promise chain: ' + tmo);
					reject(tmo);
				});
			} catch(e) {
				console.log('exception occured in read from synth: ' + e);
				reject(e);
			}
		});
	}
	
	static waitForWSD(mIn) {
		return new Promise((resolve,reject) => {
			new Sysex().listen(mIn, 30000)
			.then((sx) =>{
				if (sx.command == _WSD) resolve(sx);
			}).catch((err) => {
				reject(err);
			});
		});
	}
	
	static _fillResult(raw, accu) {
		do {
			switch (accu.fs) {
				case FillState.up1:
					if (raw.length == 0) return;
					if (accu.Result.length >= 64) return;		// ignore reverb for now
					accu.Current.upd1 = raw.splice(0,64);
					accu.fs = FillState.up2;
				case FillState.up2:
					if (raw.length == 0) return;
					accu.Current.up2 = raw.splice(0,64);
					accu.fs = FillState.upc;
				case FillState.upc:
					if (raw.length == 0) return;
					accu.Current.upc = raw.splice(0,64);
					accu.fs = FillState.lp1;
				case FillState.lp1:
					if (raw.length == 0) return;
					accu.Current.lp1 = raw.splice(0,64);
					accu.fs = FillState.lp2;
				case FillState.lp2:
					if (raw.length == 0) return;
					accu.Current.lp2 = raw.splice(0,64);
					accu.fs = FillState.lpc;
				case FillState.lpc:
					if (raw.length == 0) return;
					accu.Current.lpc = raw.splice(0,64);
					accu.fs = FillState.pd;
				case FillState.pd:
					if (raw.length == 0) return;
					accu.Current.pd = raw.splice(0,64);
					accu.Result.push(accu.Current);
					accu.Current = new RolandPatch;
					accu.fs = FillState.up1;
			}
		} while (raw.length > 0);
	};

	/**
	 * readMemory
	 * reads the internal memory and returns an array of RolandPatch objects
	 * (yet without reverb data)
	 * The D50 must initiate the transfer with a WSD telegram, which is awaited in waitForWSD.
	 */
	static async readMemory(mIn, mOut, mChan) {
		var Accu = {Result: [], 
			fs: FillState.up1,
			Current: new RolandPatch,
		};
		
		try {
			var resp;
			var rd = new Sysex();
			var ds = new Sysex();
			var ack = new Sysex();
			ack.brand = 0x41;
			ack.channel = mChan;
			ack.model = 0x14;
			ack.command = _ACK;
			var Ret = ds.listen(mIn);
			rd.brand = 0x41;
			rd.channel = mChan;
			rd.model = 0x14;
			rd.command = _RQD;
			rd.append([2,0,0]);
			rd.append(RolandPatch.num2threebyte(64*448));
			console.log("sending >>>" + rd.sendData + "<<");
			ack.send(mOut);
			do {
				let sx = await Ret;
				resp = sx.command;
				//console.log(`response 0x${resp.toString(16)}`);
				if (resp == _DAT) {
					Ret = ds.listen(mIn);
					//console.log(`received ${sx.raw.length-3} byte`); 
					// fill a RolandPatch with the data
					RolandPatch._fillResult(sx.raw.slice(3), Accu);
					ack.send(mOut);
				} else if (resp != _EOD) {
					console.log("protocol error in readMemory");
					throw "protocol error";
				}
			} while(resp != _EOD);
			ack.send(mOut);
			return Accu.Result;
		} catch(e) {
			console.log('exception occured in readMemory: ' + e);
			throw e;
		}			
	}
}