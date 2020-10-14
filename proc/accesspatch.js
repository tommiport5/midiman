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

const NumWriteBanks = 2;	// only bank A and B storable

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
	 * readFromSynth
	 * reads the current edit patch into this object
	 */
	readFromSynth() {
		return new Promise((resolve,reject) => {
			try {
				var rd = new Sysex(this.mChan, _SIR);
				var ds = new Sysex();
				var Ret = ds.listen(this.mIn);
				rd.append([0,0x40]);
				console.log("sending >>" + rd.asSendData() + "<<");
				rd.send(this.mOut);
				Ret.then((sx) => {
					let add = sx.raw.slice(0,2);
					let sxd = sx.raw.slice(2);
					console.log("received " + sxd.length + " byte for bank " + add[0]);
					this.__A = sxd.slice(0,128);
					this.__B = sxd.slice(128,256);
					this._complete = true;
					resolve("ok");
				}).catch ((e) =>{
					console.log("readFromSynth: " + e);
					reject(e);
				});
			} catch(e) {
				console.log('exception occured in read from synth: ' + e);
				reject(e);
			}
		});
	}
	
	/**
	 * writeToSynth
	 * writes this patch into the current edit patch on the synth
	 */
	writeToSynth(mOut, mChan) {
		// Sysex.trace = true;
		if (!this._complete) {
			return Promise.reject("no patch");
		}
		try {
			var dump = new Sysex(mChan, _SID);
			dump.append([0,0x40]);
			dump.append(this.__A);
			dump.append(this.__B);
			dump.send(mOut);
			return Promise.resolve("ok");
		} catch(e) {
			console.log('exception occured in write to synth: ' + e);
			return Promise.reject(e);
		}
	}
				

	/**
	 * readMemory
	 * reads the internal memory and returns an array of AccessPatch objects
	 * cannot read all banks in one go, because the browser gets unpatient :-(
	 */
	static async readMemoryBankFromSynth(mIn, mOut, mChan, bank) {
		try {
			var resp;
			var ds = new Sysex();
			var Result = new Array(128);
			// Sysex.trace = true;
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
		var Result = [];
		var som;
		var eom;
		if (fbuf[0] != 0xf0) throw "Not a sysex file";
		som = 1;
		while (som < fbuf.length) {
			let bank = [];
			for (let i=0; i<128; i++) {
				let patch = new AccessPatch();
				eom = fbuf.indexOf(0xf7, som);
				patch.__A = fbuf.slice(som+8,som+136);	//3 id. 1 prod, 1 dev, 1 cmd, 1 bnum, 1 pnum
				patch.__B = fbuf.slice(som+136, eom);
				patch._complete = true;
				bank.push(patch);
				som = eom+2;
				if (som >= fbuf.length) break;	//preemptive termination is ok
				if (fbuf[eom+1] != 0xf0) 
					throw "Syntax error in sysex file";
			}
			Result.push(bank);
		}
		return Result;
	}
	
	/**
	 * writeMemoryToBlob
	 * constructs a.asBlob from all the patches in datarr converted into sysexes
	 * implementation:
	 * iterate over all the banks in datarr
	 *		iterate over all the patches
	 *			make one sysex and concat it to the blob
	 */
	static writeMemoryToBlob(datarr) {
		var dat = [];
		let bnum = 1;
		datarr.forEach((bank) => {
			let pnum = 0;
			bank.forEach((pt)=> {
				let pts = new Sysex(0, _SID);
				pts.append([bnum, pnum]);
				pts.append(pt.__A);
				pts.append(pt.__B);
				dat = dat.concat(pts.asBlob());
				pnum++;
			});
			bnum++;
		});
		return Buffer.from(Uint8Array.from(dat));
	}
	
	static writePatchToBlob(pat) {
		let pts = new Sysex(0, _SID);
		pts.append([0, 0]);
		pts.append(pat.__A);
		pts.append(pat.__B);
		var dat = pts.asBlob();
		return Buffer.from(Uint8Array.from(dat));
	}
	
	/**
	 * writeMemoryToSynth
	 * writes all the banks in Mem to the Synth.
	 */
	static writeMemoryToSynth(Mem, mOut, mChan) {
		var dat = [];
		for (let bank=1; bank <= NumWriteBanks; bank++) {
			let pnum = 0;
			Mem[bank-1].forEach((pt)=> {
				let pts = new Sysex(mChan, _SID);
				pts.append([bank, pnum]);
				pts.append(pt.__A);
				pts.append(pt.__B);
				pts.send(mOut);
				pnum++;
			});
		}
	}
}
		


