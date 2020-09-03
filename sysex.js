/**
 * Sysex
 * class for sysex handling
 * based on webmidi
 */
 
var _trace = false;

const ChecksumType = Object.freeze ({
	Roland: 1,
	access: 2
});

class Sysex {
	static set trace(trc) {
		_trace = trc;
	}
	constructor(Brand, Channel, Model, Command) {
		this.rawData = [];
		this._brand = Brand;
		this._channel = Channel;
		this._model = Model;
		this._command = Command;
	}
	
	get raw() {
		return this.rawData;
	}
	
	set raw(data) {
		this.rawData = data;
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
						if (_trace) console.log("receiving sysex: " + This.rawData.slice(1,17).map((val) => {return "0x" + val.toString(16);})); 
						inp.removeListener("sysex");
						This._parseTelegram();
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

	get sendData() {
		return this._buildTelegram().map((val) => {
			return "0x" + val.toString(16);
		});
	}
	
	get blob() {
		var net = this._buildTelegram();
		net.unshift(0xf0);
		net.pop(0xf7);
		return net;
	}
	
	send(out) {
		if (_trace) console.log("sending sysex:   " + this.sendData.slice(0,16));
		var sx = this._buildTelegram();
		out.sendSysex(sx[0], sx[1]);
	}
}

class  RolandSysex extends Sysex {
	constructor(chan, cmd) {
		super(0x41, chan, 14, cmd);
	}
	
	// roland specific
	_checksum() {
		return -this.rawData.reduce(function(total, val) {
			return total+val;
		});		
	}
	
	
	/**
	 * parseTelegram
	 * parses the telegram from webmidi and fills the member variables
	 */
	_parseTelegram() {
		this.rawData.shift();
		this._brand = this.rawData.shift();
		this._channel = this.rawData.shift();
		this._model = this.rawData.shift();
		this._command = this.rawData.shift();
		this.rawData.pop();
		if (this.rawData.length > 0 ) {
			if (this.rawData.reduce((total, cur) => {total += cur;}) && 0xff != 0) {
				inp.removeListener("sysex");
				console.log("reject checksum error");
				reject("checksum error");
				return;
			} else {
				this.rawData.pop();
			}
		}
	}
	
	/**
	 * _buildTelegram
	 * builds the telegram for webmidi from the member variables
	 and returns an array of the two parameters for output.sendSysex
	 */
	_buildTelegram() {
			if (this.rawData.length == 0) {
			return [this._brand, [this._channel, this._model, this._command]];
		}else {
			return [this._brand, [this._channel, this._model, this._command].concat(this.rawData, [this._checksum() & 0x7f])];
		}
	}
		
}

class AccessSysex extends Sysex {
	constructor(chan, cmd) {
		super([0, 0x20, 0x33], chan, 1, cmd);
	}
	_parseTelegram() {
	}
	_buildTelegram() {
	}
}

module.exports = {rs:RolandSysex, as:AccessSysex};

