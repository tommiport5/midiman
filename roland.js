/**
 * Class Roland
 * manages communication with a Roland Synthesizer via Sysex Messages
 */
 
var Sysex = require('./sysex');
var Patch = require('./rolandpatch');
const Base64 = require('Base64');

module.exports = class Roland {
	constructor() {
		this.clipboard = new Patch();
	}
	
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
	
	
	/*
	_getVar(id) {
		var ind;
		switch (id[0]) {
			case 'c':
				return this.clipboard;
			case 's':
				ind = Number(id.substr(1)) - 1;
				return this.SynthPatches[ind];
			case 'f':
				ind = Number(id.substr(1)) - 1;
				return this.FilePatches[ind];
		}
	}

	
	move(from, to) {
		var fv = this._getVar(from);
		var tv = this._getVar(to);
		if (fv == undefined) return "Source empty";
		if (tv == undefined) return "Destination undefined";
		tv = fv;
		return "Ok";
	}
	*/
	
	_getOrSetVar(id, value) {
		var ind;
		switch (id[0]) {
			case 'c':
				if (value !== undefined) this.clipboard = value;
				return this.clipboard;
				break;
			case 's':
				ind = Number(id.substr(1));
				if (value !== undefined) this.SynthPatches[ind] = value;
				else return this.SynthPatches[ind];
				break;
			case 'f':
				ind = Number(id.substr(1));
				if (value !== undefined) this.FilePatches[ind] = value;
				else return this.FilePatches[ind];
				break;
		}
	}

	move(from, to) {
		if ((from[0] == 's' || to[0] == 's') && this.SynthPatches == undefined) return "SynthPatches undefined!";
		if ((from[0] == 'f' || to[0] == 'f') && this.FilePatches == undefined) return "FilePatches undefined!";
		this._getOrSetVar(to, this._getOrSetVar(from));
		return "Ok";
	}
}
 