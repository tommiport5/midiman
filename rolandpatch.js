/**
 * Class RolandPatch
 * manages patches on a Roland Synthesizer
 * the 3byte notation is MSB, middle septet, LSB
 */
 
var Combi = require('./sysex');
var Sysex = Combi.rs;
var ChecksumType = Combi.ct;

const _rochar = " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890-";
const _WSD = 0x40;
const _RQD = 0x41;
const _DAT = 0x42;
const _ACK = 0x43;
const _EOD = 0x45;
const _RJC = 0x4f;
const _RQ1 = 0x11;

const FillState = Object.freeze ({
	up1: 1,
	up2: 2,
	upc: 3,
	lp1: 4,
	lp2: 5,
	lpc: 6,
	pd: 7
});

function address2PatchAndState(adr) {
	let point = (adr - 32768) / 448;
	let patch = Math.trunc(point);
	let state = Math.round((point-patch)*7) + 1;
	return [patch, state];
}

module.exports = class RolandPatch {
	constructor(MIn, MOut, MChan) {
		this.mIn = MIn;
		this.mOut = MOut;
		this.mChan = MChan;
		this._complete = false;
	}
	
	get complete() {
		return this.complete;
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
		var res;
		if (this.pd == undefined) {
			res = "<undefined>";
		} else {
			res = RolandPatch.toStr(this.pd.slice(0,18));
			if (!this._complete) res += " <incomplete>";
		}
		return res;
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
	
	static fs2mem(pnum, fs) {
		return RolandPatch.threebyte2num([2,0,0]) + pnum*448 + (fs-1)*64;
	}
	
	static threebyte2num(arr) {
		return ((arr[0] & 0x7f) << 14) | ((arr[1] & 0x7f) << 7) | (arr[2] & 0x7f);
	}		
			
	static num2threebyte(num) {
		var res = [0,0,0];
		var n = Math.round(num);
		res[2] = n & 0x7f;
		res[1] = (n >> 7) & 0x7f;
		res[0] = (n >> 14) & 0x7f;
		return res;
	}
	
	/**
	 *readFromSynth
	 * reads one patch into this object
	 */
	readFromSynth() {
		var This = this;
		return new Promise((resolve,reject) => {
			try {
				var rd = new Sysex(This.mChan, _RQ1);
				var ds = new Sysex();
				var Ret = ds.listen(This.mIn);
				rd.append([0,0,0]);
				rd.append(RolandPatch.num2threebyte(256));
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
					rd = new Sysex(This.mChan, _RQ1);
					rd.append(RolandPatch.num2threebyte(256));
					rd.append(RolandPatch.num2threebyte(192));
					rd.send(This.mOut);
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
					this._complete = true;
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
	
	static waitForACK(mIn) {
		return new Promise((resolve,reject) => {
			new Sysex().listen(mIn, 30000)
			.then((sx) =>{
				if (sx.command == _ACK) resolve(sx);
			}).catch((err) => {
				reject(err);
			});
		});
	}
	
	static waitForRQD(mIn) {
		return new Promise((resolve,reject) => {
			new Sysex().listen(mIn, 30000)
			.then((sx) =>{
				if (sx.command == _RQD) resolve(sx);
			}).catch((err) => {
				reject(err);
			});
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
	
	static anounceAllPatches(mOut, mChan) {
		var wsd = new Sysex(mChan, _WSD);
		wsd.raw = [2,0,0];
		wsd.append(RolandPatch.num2threebyte(64*448-1));
		wsd.send(mOut);
	}
		

	/*
	 * fillResult
	 * fills 64 Rolandpatches with the data from a midi sysex
	 */
	static _fillResult(rw, accu) {
		let threeb = rw.slice(0,3);
		let addr = RolandPatch.threebyte2num(threeb);
		if (accu.pnum >= 64) {
			// console.log(`Ignoring data for addr ${addr}`);
			return;		// ignore reverb for now
		}
		let found = address2PatchAndState(RolandPatch.threebyte2num(threeb));
		if ((found[0] != accu.pnum) || (found[1] != accu.fs)){
			console.log(`resync to ${found[0]}, ${found[1]} instead of ${accu.pnum}, ${accu.fs}, addr ${threeb}`);
			accu.pnum = found[0];
			accu.fs = found[1];
		}
		let raw = rw.slice(3);
		if (accu.overflow.length > 0) {
			console.log(`Overflow ${accu.overflow.length} after patch ${accu.Result.length}, state ${accu.fs}`);
			raw = accu.overflow.concat(raw);
			accu.overflow = [];
		}
		for (;;) {
			if (accu.pnum >= 64) {
				if (accu.overflow.length > 0) console.log(`leftover ${accu.overflow.length} bytes`);
				return;		// ignore reverb for now
			}
			if (raw.length == 0) {
				return;
			}
			if (raw.length < 64 && accu.pnum < 63) {	// exception because of length bug
				accu.overflow = raw;
				return;
			}
			switch (accu.fs) {
				case FillState.up1:
					if (accu.Result[accu.pnum] == undefined) accu.Result[accu.pnum] = new RolandPatch();
					accu.Result[accu.pnum].up1 = raw.splice(0,64);
					accu.fs = FillState.up2;
					break;
				case FillState.up2:
					accu.Result[accu.pnum].up2 = raw.splice(0,64);
					accu.fs = FillState.upc;
					break;
				case FillState.upc:
					accu.Result[accu.pnum].upc = raw.splice(0,64);
					accu.fs = FillState.lp1;
					break;
				case FillState.lp1:
					accu.Result[accu.pnum].lp1 = raw.splice(0,64);
					accu.fs = FillState.lp2;
					break;
				case FillState.lp2:
					accu.Result[accu.pnum].lp2 = raw.splice(0,64);
					accu.fs = FillState.lpc;
					break;
				case FillState.lpc:
					accu.Result[accu.pnum].lpc = raw.splice(0,64);
					accu.fs = FillState.pd;
					break;
				case FillState.pd:
					accu.Result[accu.pnum].pd = raw.splice(0,64);
					accu.Result[accu.pnum]._complete = true;
					accu.pnum++;
					accu.fs = FillState.up1;
					break;
			}
		}
	}

	/*
	 * makePackets
	 * makes Midi sysex packets from 64 Rolandpatches
	 * special here: the last patch must have one byte less than the usual
	 * 448, because the D50 only accepts 64*448-1 bytes of patch data
	 */
	static _makePackets(accu, mChan) {
		var dcount = 0;
		var dat = new Sysex(mChan, _DAT);
		dat.raw = RolandPatch.num2threebyte(RolandPatch.fs2mem(accu.pnum, accu.fs));
		for (;;) {
			switch (accu.fs) {
				case FillState.up1:
					if (accu.Pts[accu.pnum] && accu.Pts[accu.pnum].up1) {
						dat.append(accu.Pts[accu.pnum].up1);
					} else {
						return dat;
					}
					accu.fs = FillState.up2;
					if (++dcount >= 4) return dat;
				case FillState.up2:
					if (accu.Pts[accu.pnum] && accu.Pts[accu.pnum].up2) {
						dat.append(accu.Pts[accu.pnum].up2);
					} else {
						let dt = new Array(64);
						dt.fill(0);
						dat.append(dt);
					}
					accu.fs = FillState.upc;
					if (++dcount >= 4) return dat;
				case FillState.upc:
					if (accu.Pts[accu.pnum] && accu.Pts[accu.pnum].upc) {
						dat.append(accu.Pts[accu.pnum].upc);
					} else {
						let dt = new Array(64);
						dt.fill(0);
						dat.append(dt);
					}
					accu.fs = FillState.lp1;
					if (++dcount >= 4) return dat;
				case FillState.lp1:
					if (accu.Pts[accu.pnum] && accu.Pts[accu.pnum].lp1) {
						dat.append(accu.Pts[accu.pnum].lp1);
					} else {
						let dt = new Array(64);
						dt.fill(0);
						dat.append(dt);
					}
					accu.fs = FillState.lp2;
					if (++dcount >= 4) return dat;
				case FillState.lp2:
					if (accu.Pts[accu.pnum] && accu.Pts[accu.pnum].lp2) {
						dat.append(accu.Pts[accu.pnum].lp2);
					} else {
						let dt = new Array(64);
						dt.fill(0);
						dat.append(dt);
					}
					accu.fs = FillState.lpc;
					if (++dcount >= 4) return dat;
				case FillState.lpc:
					if (accu.Pts[accu.pnum] && accu.Pts[accu.pnum].lpc) {
						dat.append(accu.Pts[accu.pnum].lpc);
					} else {
						let dt = new Array(64);
						dt.fill(0);
						dat.append(dt);
					}
					accu.fs = FillState.pd;
					if (++dcount >= 4) return dat;
				case FillState.pd:
					if (accu.Pts[accu.pnum] && accu.Pts[accu.pnum].pd) {
						if (accu.pnum ==63)
							dat.append(accu.Pts[accu.pnum].pd.slice(0,63));
						else
							dat.append(accu.Pts[accu.pnum].pd);
					} else {
						let dt;
						if (accu.pnum ==63)
							dt = new Array(63);
						else
							dt = new Array(64);
						dt.fill(0);
						dat.append(dt);
					}
					accu.fs = FillState.up1;
					if (++accu.pnum >= 64) return dat;;
					if (++dcount >= 4) return dat;
			}
		}
	}	 

	/**
	 * readMemory
	 * reads the internal memory and returns an array of RolandPatch objects
	 * (yet without reverb data)
	 * The D50 must initiate the transfer with a WSD telegram, which is awaited in waitForWSD.
	 */
	static async readMemoryFromSynth(mIn, mOut, mChan) {
		var Accu = {Result: new Array(64), 
			fs: FillState.up1,
			pnum: 0,
			overflow: [], 
			expected: 32768
		};
		
		try {
			var resp;
			var ds = new Sysex();
			var ack = new Sysex(mChan, _ACK);
			var Ret = ds.listen(mIn);
			ack.send(mOut);
			do {
				let sx = await Ret;
				resp = sx.command;
				//console.log(`response 0x${resp.toString(16)}`);
				if (resp == _DAT) {
					Ret = ds.listen(mIn);
					// let rcv = sx.raw.length-3;
					// if (rcv < 256) console.log(`received ${rcv} byte`); 
					// fill a RolandPatch with the data
					RolandPatch._fillResult(sx.raw, Accu);
					ack.send(mOut);
				} else if (resp != _EOD) {
					console.log("protocol error, received 0x${resp.toString(16)} instead of 0x40 or 0x45 in readMemory");
					throw "protocol error";
				}
			} while(resp != _EOD);
			ack.send(mOut);
			// console.log(Accu.Result[63].patchname); hier noch ok.
			return Accu.Result;
		} catch(e) {
			console.log('exception occured in readMemory: ' + e);
			throw e;
		}			
	}

	static readMemoryFromBlob(fbuf) {
		var Accu = {Result: new Array(64), 
			fs: FillState.up1,
			pnum: 0,
			overflow: [], 
			expected: 32768
		};
		
		var som;
		var eom;
		if (fbuf[0] != 0xf0) throw "Not a sysex file";
		som = 1;
		while (som < fbuf.length) {
			eom = fbuf.indexOf(0xf7, som);
			RolandPatch._fillResult(fbuf.slice(som+4, eom-1),Accu);
			if (eom+1 < fbuf.length && fbuf[eom+1] != 0xf0) 
				throw "Syntax error in sysex file";
			som = eom+2;
		}
		return Accu.Result;
	}
	
	static writeMemoryToBlob(datarr) {
		var dat = [];
		var Accu = {Pts: datarr, 
			fs: FillState.up1,
			pnum: 0};
		while (Accu.pnum <64) {
			dat = dat.concat(RolandPatch._makePackets(Accu,0).blob);
		}
		//console.log(`_makePackets ended with pnum ${Accu.pnum}, fs ${Accu.fs}`);
		return Buffer.from(Uint8Array.from(dat));
	}
	
	static writePatchToBlob(datarr) {
		var dat = [];
		var Accu = {Pts: [datarr, undefined],
			fs: FillState.up1,
			pnum: 0};
		while (Accu.pnum <1) {
			dat = dat.concat(RolandPatch._makePackets(Accu,0).blob);
		}
		//console.log(`_makePackets ended with pnum ${Accu.pnum}, fs ${Accu.fs}`);
		return Buffer.from(Uint8Array.from(dat));
	}
	
	/**
	 * writeMemoryToSynth
	 * writes the array of 64 patches in Mem to the D50.
	 * special here: I must be an async function to keep the handshake protocol
	 * via await, but it must also return a Promise, so that the calling thread can
	 * "join" this thread via "then"
	 */
	static async writeMemoryToSynth(Mem, mIn, mOut, mChan) {
		var Ret;
		var ds = new Sysex();
		var Accu = {Pts: Mem, 
			fs: FillState.up1,
			pnum: 0};
			
		while (Accu.pnum <64) {
			Ret = ds.listen(mIn);
			RolandPatch._makePackets(Accu, mChan).send(mOut);
			let sx = await Ret;
			if (sx.command != _ACK) {
				console.log(`protocol error, received 0x${sx.command.toString(16)} instead of 0x43 in writeMemory`);
				return Promise.reject(new Error("protocol error"));
			}
		}
		Ret = ds.listen(mIn);
		var eod = new Sysex(mChan, _EOD);
		eod.send(mOut);
		return Ret;
	}
}
		


