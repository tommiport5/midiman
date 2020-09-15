/**
 * Class AccessPatch
 * manages patches on an access virus
 * A single patch consists of 4 buffers A to D
 */
 
var Combi = require('./sysex');
var Sysex = Combi.as;

const _SIR = 0x30;
const _MUR = 0x31;
const _SBR = 0x32;
const _MBR = 0x33;
const _SID = 0x10;
const _MUD = 0x11;

const FillState = Object.freeze ({
	__A: 1,
	__B: 2,
	__C: 3,
	__D: 4,
});

function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}

module.exports = class AccessPatch {
	constructor(MIn, MOut, MChan) {
		this.mIn = MIn;
		this.mOut = MOut;
		this.mChan = MChan;
		this._complete = false;
	}
	
	get complete() {
		return this._complete;
	}
	

	get patchname() {
		var res = "";
		if (this.__B == undefined) {
			res = "<undefined>";
		} else {
			this.__B.slice(111,122).reduce((total, val) => {res += String.fromCharCode(val);});
			if (!this._complete) res += " <incomplete>";
		}
		return res;
	}
	
	/**
	 *readFromSynth
	 * reads one patch into this object
	 */
	readFromSynth() {
		return new Promise((resolve,reject) => {
			try {
				var rd = new Sysex(this.mChan, _SIR);
				var ds = new Sysex();
				var Ret = ds.listen(this.mIn);
				rd.append([0,0x40]);
				console.log("sending >>" + rd.sendData + "<<");
				rd.send(this.mOut);
				Ret.then((sx) => {
					let add = sx.raw.slice(0,2);
					let sxd = sx.raw.slice(2);
					console.log("received " + sxd.length + " byte for bank " + add[0]);
					this.__A = sxd.slice(0,128);
					this.__B = sxd.slice(128,256);
					this._complete = true;
					return resolve("ok");
				}).catch ((e) =>{
					console.log("readFromSynth: " + e);
					return reject(e);
				});
			} catch(e) {
				console.log('exception occured in read from synth: ' + e);
				return reject(e);
			}
		});
	}
	


	/*
	 * makePackets
	 * makes Midi sysex packets from 64 Rolandpatches
	 * special here: the last patch must have one byte less than the usual
	 * 448, because the D50 only accepts 64*448-1 bytes of patch data
	 */
	static _makePackets(accu, mChan) {
		var dcount = 0;
		var dat = new Sysex();
		dat.brand = 0x41;
		dat.channel = mChan;
		dat.model = 0x14;
		dat.command = _DAT;
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
	 * reads the internal memory and returns an array of AccessPatch objects
	 * must not read all banks in one go, because the browser gets unpatient :-(
	 */
	static async readMemoryBankFromSynth(mIn, mOut, mChan, bank) {
		try {
			var resp;
			var ds = new Sysex();
			var Result = new Array(128);
			Sysex.trace = true;
			let sbr = new Sysex(mChan, _SBR);
			sbr.append([bank+1]);
			sbr.send(mOut);
			for (let prog = 0; prog < 128; prog++) {
				let Ret = ds.listen(mIn);
				Result[prog] = new AccessPatch();
				let sx = await Ret;
				resp = sx.command;
				if (resp == _SID) {
					let add = sx.raw.slice(0,2);
					let sxd = sx.raw.slice(2);
					Result[prog].__A = sxd.slice(0,128);
					Result[prog].__B = sxd.slice(128);
					Result[ prog]._complete = true;
				}
			}
			await delay(1000);
			return Result;
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
		var eod = new Sysex();
		eod.brand = 0x41;
		eod.channel = mChan;
		eod.model = 0x14;
		eod.command = _EOD;
		eod.send(mOut);
		return Ret;
	}
}
		


