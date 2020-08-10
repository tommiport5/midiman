/**
 * Class Roland
 * manages communication with a Roland Synthesizer via Sysex Messages
 */
 
var Sysex = require('./sysex');
var Patch = require('./rolandpatch');


module.exports = class Roland {
	constructor(MIn, MOut, MChan) {
		this.mIn = MIn;
		this.mOut = MOut;
		this.mChan = MChan;
	}
	
	get sysexData() {
		return this.DataSet.raw;
	}
	
	getCurrentPatchName() {
		var RequestData = new Sysex();
		this.DataSet = new Sysex();

		var Ret = this.DataSet.listen(this.mIn);
		RequestData.brand = 0x41;
		RequestData.channel = this.mChan;
		RequestData.model = 0x14;
		RequestData.command = 0x11;
		RequestData.append(Patch.num2threebyte(384));		
		RequestData.append(Patch.num2threebyte(18));
		console.log("sending >>" + RequestData.sendData + "<<");
		RequestData.send(this.mOut);
		return Ret;
	}
	
	readMemory() {
		return new Promise((resolve,reject) => {
			Patch.waitForWSD(this.mIn).then((sx) => {
				console.log(`received 0x${sx.command.toString(16)}`);
				Patch.readMemory(this.mIn, this.mOut, this.mChan).then((pat) => {
					var Names = [];
					this.Patches = pat;
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
}
 