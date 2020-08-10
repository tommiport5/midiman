/**
 * Sysex
 * class for sysex handling
 * based on webmidi
 */
 

module.exports = class  Sysex {
	constructor() {
		this.rawData = [];
		this._brand = 0;
		this._channel = 0;
		this._model = 0;
		this._command = 0;
	}
	
	get raw() {
		return this.rawData;
	}
	
	set raw(data) {
		this.rawData = data;
	}
	
	_checksum() {
		return this.rawData.reduce(function(total, val) {
			return total+val;
		});		
	}
	
	get sendData() {
		if (this.rawData.length == 0) {
			// legal, also omit checksum
			return [this._brand, this._channel, this._model, this._command].map((val) => {
				return "0x" + val.toString(16);
			});
		} else {
			return [this._brand, this._channel, this._model, this._command].concat(this.rawData, [ -this._checksum() & 0x7f ]).map((val) => {
				return "0x" + val.toString(16);
			});
		}
	}
	
	set brand(Brand) {
		this._brand = Brand;
	}
	set channel(Channel) {
		this._channel = Channel;
	}
	set model(Model) {
		this._model = Model;
	}
	
	get command() {
		return this._command;
	}
	
	set command(Cmd) {
		this._command = Cmd;
	}
	
	append(arr) {
		this.rawData = this.rawData.concat(arr);
	}
	
	send(out) {
		if (this.rawData.length == 0) {
			out.sendSysex(this._brand, [this._channel, this._model, this._command]);
		}else {
			out.sendSysex(this._brand, [this._channel, this._model, this._command].concat(this.rawData, [-this._checksum() & 0x7f]));
		}
	}
		
	listen(inp, time=10000) {
		var This = this;
		return new Promise((resolve, reject) => {
			try {
				var tmo;
				inp.addListener("sysex", undefined, (ev) => {
					clearTimeout(tmo);
					// ev.data: "The raw MIDI message as an array of 8 bit values."
					// for coherence with send data, we must shift the first four to the resp class members.
					// A UInt8Array is not an array, so it has no shift() member :-(
					try {
						This.rawData = Array.from(ev.data);
						This.rawData.shift();
						This._brand = This.rawData.shift();
						This._channel = This.rawData.shift();
						This._model = This.rawData.shift();
						This._command = This.rawData.shift();
						This.rawData.pop();
						if (This.rawData.length > 0 ) {
							if (This.rawData.reduce((total, cur) => {total += cur;}) && 0xff != 0) {
								inp.removeListener("sysex");
								console.log("reject checksum error");
								reject("checksum error");
								return;
							} else {
								This.rawData.pop();
							}
						}
						inp.removeListener("sysex");
						resolve(This);
					} catch(e) {
						console.log(e);
					}
				});
				tmo = setTimeout(() => {
					inp.removeListener("sysex");
					reject("timeout");
					}, time);
			} catch {
				reject("Cannot add listener");
			}
		});
	}
}