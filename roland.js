/**
 * Class Roland
 * manages communication with a Roland Synthesizer via Sysex Messages
 */
 
var Sysex = require('./sysex');
var Patch = require('./rolandpatch');
const Base64 = require('Base64');

module.exports = class Roland {
	// we only need these data for two functions => make it parameters
	// constructor(MIn, MOut, MChan) {
		// this.mIn = MIn;
		// this.mOut = MOut;
		// this.mChan = MChan;
	// }
	
	get sysexData() {
		return this.DataSet.raw;
	}
	
	getCurrentPatchName(mIn, mOut, mChan) {
		var RequestData = new Sysex();
		this.DataSet = new Sysex();

		var Ret = this.DataSet.listen(mIn);
		RequestData.brand = 0x41;
		RequestData.channel = mChan;
		RequestData.model = 0x14;
		RequestData.command = 0x11;
		RequestData.append(Patch.num2threebyte(384));		
		RequestData.append(Patch.num2threebyte(18));
		RequestData.send(mOut);
		return Ret;
	}
	
	readMemoryFromSynth(mIn, mOut, mChan) {
		return new Promise((resolve,reject) => {
			Patch.waitForWSD(mIn).then((sx) => {
				// console.log(`received 0x${sx.command.toString(16)}`);
				Patch.readMemoryFromSynth(mIn, mOut, mChan).then((pat) => {
					var Names = [];
					this.SynthPatches = pat;
					pat.forEach((pt) => {
						Names.push(pt.patchname);
					});
					resolve(Names);
				}).catch((err) => {
					reject(err);
				});
			}).catch ((err) => {
				reject(err);
			});
		});
	}

	writeMemoryToSynth(mIn, mOut, mChan) {
		// Sysex.trace = true;
		return new Promise((resolve, reject) => {
			if (this.SynthPatches == undefined) return Promise.reject(new Error("No patches loaded"));
			Patch.waitForRQD(mIn).then((sx) => {
				let Ret = Patch.waitForACK(mIn);
				Patch.anounceAllPatches(mOut, mChan);
				return Ret;
			}).then((sx) => {
				return Patch.writeMemoryToSynth(this.SynthPatches, mIn, mOut, mChan);
			}).then(() => {
				resolve("Ok");
			}).catch ((e) => {
				reject(new Error(e));
			});
			// must return a Promise here, or the caller will break on 'then'
			// this is, what the return statement above does.
			// the last then or the catch resolve or reject the returned promise
		});
	}
	
	readMemoryFromDataURL(postdat) {
		return new Promise((resolve,reject) => {
			var start = postdat.indexOf('base64,');
			if (start == -1) reject("base64 error");
			try {
				var Names = [];
				// why doen't this work?
				// var Dat = Uint8Array.from(Base64.atob(postdat.slice(start+7)));
				var Dat = Base64.atob(postdat.slice(start+7));
				var DatArr = new Array(Dat.length);
				for (var i=0; i< Dat.length; i++)
					DatArr[i] = Dat.charCodeAt(i);
				this.FilePatches = Patch.readMemoryFromBlob(DatArr);
				this.FilePatches.forEach((pt) => {
					Names.push(pt.patchname);
				});
				resolve(Names);
			} catch (e) {
				reject(e);
			}
		});
	}
	
	writeMemoryToData() {
		if (this.FilePatches == undefined) return Promise.reject(new Error("No patches loaded"));
		return new Promise((resolve,reject) => {
			try {
				var DatArr = Patch.writeMemoryToBlob(this.FilePatches);
				//var Dat = Base64.btoa(DatArr);
				resolve(DatArr);
			} catch (e) {
				reject(e);
			}
		});
	}
	
	swap() {
		var tmp = this.FilePatches;
		this.FilePatches = this.SynthPatches;
		this.SynthPatches = tmp;
	}
		
}
 