"use strict"


const defaultBorderstyle = "outset";
const highlightBorderstyle = "inset";
const ButtonLabels = SingleReadBanks + MultiReadBanks;
const ButtonPrefix = "SF";

var NetSingleBanks = SingleReadBanks.replace(/ /g, '');
var NetMultiBanks = MultiReadBanks.replace(/ /g, '');

/**
 * class PatId
 * Generalized patch id.
 * Consists of:
 *	*not* Source/Destination: S[ynth] of F[ile]	, because this is determined by the containing class
 *	*not* Bank Type:		S[ingle] or M[ulti] , because this can be calculated from the bank number
 *	*not* display page:		1 or 2				, because this can be calculated from pnum
 * 	Bank Number: 	0..14(currently), depending on Synth architecture
 *	Patch Number:	0..127, depending on Synth architecture
 * It takes account of 'holes' (space characters) in the ..ReadBanks specifiers, which
 * have no corresponding entry in the 'pat' array and no bank number
 * With pnum = 0 or 64 it will also be used as value for Navi._curpage
 */
class PatId {
	constructor(bank, pnum) {
		this._bank = bank;
		this._pnum = pnum;
	}
	
	get BankTypePrefix() {
		return this._bank < NetSingleBanks.length ? 'S' : 'M';
	}
	get BankLetter() {
		if (this.BankTypePrefix == 'S') return NetSingleBanks[this._bank];
		else return NetMultiBanks[this._bank-NetSingleBanks.length];
	}
	get bank() {return this._bank;}
	get pnum() {return this._pnum;}
	get page() {return this._pnum < 64 ? 0 : 1;}
	
	/**
	 * toString: a readable and parseable string representation
	 */
	toString() {
		var str = this.BankTypePrefix;
		str += this.BankLetter;
		str += this.pnum;
		return str;
	}
	
	/**
	 * asButtonId
	 * a readable id for a select button.
	 * Needs to be told, where this instance is in.
	 * Does not include pnum, but calculated page.
	 */
	asButtonId(synth_or_file) {
		var str = synth_or_file + this.BankTypePrefix;;
		str += this.BankLetter;
		str += this.pnum < 64 ? '1' : '2';
		return str;
	}
	
	/**
	 * convertDndToServer
	 * converts the drop source/target id to a server string.
	 * The server string takes the form [sf][SM][A-N]\d{1,3} with the number in the range 0-127.
	 */
	convertDndToServer(target_id) {
		let sv = target_id[0].toLowerCase();
		sv += this.BankTypePrefix;
		sv += this.BankLetter;
		let num = Number(target_id.substr(2));
		if (this.page) num += 60;	// patchnumbers on page 2 start at 60!
		return sv + num;
	}
}
	
/**
 * class Navi
 * organizes the navigation and drag'n'drop on the patch tables.
 * Provides ids for the patches on server side and on ui side.
 * Patches on the server are organized in 8 banks @ 128 patches.
 * Patches on the ui side are organized in 8 banks @ 2 pages @ 64 patches (Numbers apply to access virus).
 * Additionally, there are 2 slots for the synth patches and the file patches, so
 * there is one instance for the SynthPatches and one for the FilePatches.
 * One extra patch is for the clipboard. 
 * A side consideration is that HTML element ids should be unique on a page and should not 
 * be changed once they are assigned.
 * Banks of patches can be of several types (Single, Multi), which are denoted by 'type' letters (currently 'S' or 'M').
 * The original sysex data in a bank are the "pat" properties of the bank.
 * To distinguish between "Single Patches" or "Programs" and "Multi Patches" or "Combinations"
 * the former are denoted by upper case letters and the latter by lower case letters.
 */
class Navi {
	constructor(pid, seltab) {
		this._pelem = document.getElementById(pid);
		this._seltab = seltab;
		this._patches = undefined;
		this._curpage = undefined;
	}
	
	get patches() {return this._patches;}
	set patches(pat) {this._patches = pat;}
	// The current page member is of class PatId
	get curpage() {return this._curpage;}
	set curpage(pg) {this._curpage = pg;}
	
	// push a patch name (instead of getting and setting
	push_pat(pat) {this._patches.push(pat);}
	// complete pnum with the info from curpage and set the text
	// of the corresponding entry in this._patches
	set_pat(pnum, text) {
		this._patches[this._curpage.bank].pat[pnum] = text;
	}
		
	
	/**
	 * swap
	 * exchanges the patches of the current page in SynthPatches and FilePatches.
	 * The current page members are corrected "on the fly".
	 * It can be invoked on any of the two instances with the same result.
	 * Warning: invoking it a second time on the other instance reverses the effect of the first invocation!
	 */
	swap(rOther) {
		var tmp = this._patches;
		this._patches = rOther._patches;
		rOther._patches = tmp;
		if (this._curpage) document.getElementById(this._curpage.asButtonId(this._buttonPrefix())).style.borderStyle = defaultBorderstyle;
		if (rOther._curpage) document.getElementById(rOther._curpage.asButtonId(rOther._buttonPrefix())).style.borderStyle = defaultBorderstyle;
		tmp = this.curpage;
		this._curpage = rOther._curpage;
		rOther._curpage = tmp;
	}
	
	/**
	 * prepareSwitchTable
	 * Constructs the buttons for the switch tables including the unique ids.
	 */
	prepareSwitchTable(TabId, ButList) {
		var Tab = document.getElementById(TabId);
		Tab.textContent = "";
		var CurrentRow;
		var Offset;
		if (TabId[1] == 'm') Offset = NetSingleBanks.length;
		else Offset = 0;
		for(let i=0; i< ButList.length; i++) {
			if (i%PagesPerRow == 0) {
				CurrentRow = Tab.insertRow(-1);
			}
			let td = CurrentRow.insertCell(-1);
			td.className = this._seltab[0] == 's' ? "slb" : "flb";
			let btn = document.createElement("button");
			let pid = new PatId(i+Offset,0);
			btn.innerText = ButList[i] + "1";
			btn.onclick = this._makeDisplayNames(pid);
			btn.id = pid.asButtonId(this._buttonPrefix());
			td.appendChild(btn);
			td = CurrentRow.insertCell(-1);
			td.className = this._seltab[0] == 's' ? "slb" : "flb";
			btn = document.createElement("button");
			pid = new PatId(i+Offset,64);
			btn.innerText = ButList[i] + "2";
			btn.onclick = this._makeDisplayNames(pid);
			btn.id = pid.asButtonId(this._buttonPrefix());
			td.appendChild(btn);
		}
	}
	
	/**
	 * refreshDisplay
	 * extracts bank and page from curpage and calls displayNames.
	 */
	refreshDisplay() {
		var patid;
		if (this._curpage == undefined) {
			patid = new PatId(0,0);	// erase display
		} else {
			patid = this._curpage;
		}
		this.displayNames(patid);
	}
	
	/**
	 * displayNames
	 * displays the patchnames of the current page (identified by patid).
	 * It also sets the drag'n'drop ids from the fields.
	 */
	displayNames(patid) {
		var arr = this._pelem.querySelectorAll(".pname");
		var ind = this._pelem.querySelectorAll(".pnh");
		var i = 0;
		var tabdat;
		this._highlightButton(patid);
		if (this._patches == undefined || this.patches[patid.bank] == undefined) {
			for (;i<arr.length;) {
				arr[i++].innerText = "";
			}
			return;
		}
		if (patid.page == 0) {
			for (let n=0; n<ind.length; n++) {
				ind[n].innerText = n.toString() + "_";
			}
		} else {
			for (let n=0; n<ind.length; n++) {
				ind[n].innerText = (n+6).toString() + "_";
			}
		}
		let btab = this._patches[patid.bank].pat;
		if (btab && patid.page == 0) {
			tabdat = btab.slice(0,70);
		} else if (btab) {
			tabdat = btab.slice(60);
		}
		if (tabdat) {
			tabdat.forEach((dt) => {
				arr[i].innerText = dt;
				arr[i].setAttribute("draggable", true);
				// build the id for the fields, we also need the bank type prefix to remeber it on the clipboard
				arr[i].id = this._buttonPrefix() + patid.BankTypePrefix + i;	
				arr[i++].setAttribute("ondragstart","dragStart(event)");
			});
		} 
		for (;i<arr.length;) {
			arr[i].innerText = "";
			arr[i].setAttribute("draggable", false);
			arr[i++].removeAttribute("ondragstart");
		}
	}
	
	/**
	 * serverFromTarget
	 * determines the patch id for the server from the curpage and the drop target (or drop source).
	 * The current page member is an object of class PatId.
	 * The drop targets/sources are "S" or "F" followed by the BankTypePrefix and the 
	 * relative patch number 0-69. (Take care of the "decimal view"!)
	 * The server string takes the form [sf][SM][A-N]\d{1,3} with the number in the range 0-127.
	 * A special case is the clipboard, which has only "c" as the server string.
	 */
	static serverFromTarget(tg) {
		var sv;
		var num;
		switch (tg[0]) {
			case "c":
				return "c";
			case "S":
				return SynthPatches.curpage.convertDndToServer(tg);
			case "F":
				return FilePatches.curpage.convertDndToServer(tg);
		}
		
	}
	
	_buttonPrefix() {
		if (this._seltab == "slb") return ButtonPrefix[0];
		else return ButtonPrefix[1];
	}
	
	_highlightButton(patid) {
		if (this._curpage) {
			document.getElementById(this._curpage.asButtonId(this._buttonPrefix())).style.borderStyle = defaultBorderstyle;
		}
		this._curpage = patid;
		document.getElementById(this._curpage.asButtonId(this._buttonPrefix())).style.borderStyle = highlightBorderstyle;
	}
	
	_makeDisplayNames(patid) {
		var This = this;
		return function() {
			This.displayNames(patid);
		};
	}
	
}


var SynthPatches;
var FilePatches;
var ClipboardType;

function forcequit() {
  var xhttp = new XMLHttpRequest();
  xhttp.open("GET", '/forcequit', true);
  xhttp.send();  
  //ignore the answer
};


function getJsonData(url, func)
{
	var jsonResponse, error, detail;
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (this.readyState == 4) {
			if  (this.status == 200) {
				try {
					jsonResponse = JSON.parse(this.responseText)
					func(jsonResponse);
					return;
				} catch(e) {
					error = "parse/function";
					detail = e.name;
				}
			} else {
				error = "HTML";
				detail = this.status;
				
			}
			alert("get failed: " + url + ", error: " + error + ", d:" + detail);
		}  // ignore other ready states
	};
	xhttp.open("GET", url, true);
	xhttp.send();	
}

function getJsonParam(url, param, func)
{
	var jsonResponse, error, detail;
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if (this.readyState == 4) {
			if  (this.status == 200) {
				try {
					jsonResponse = JSON.parse(this.responseText)
					func(jsonResponse);
					return;
				} catch(e) {
					error = "JSON parse error";
					detail = e.name;
					alert("Did not receive json data from " + url + ", error: " + error + ", detail:" + detail);
				}
			} else {
				error = "HTML error";
				detail = this.status;
				
			}
		}  // ignore other ready states
	};
	xhttp.open("POST", url, true);
	xhttp.setRequestHeader('Content-Type', 'text/json; charset=utf-8');
	xhttp.send(param);	
}

function quit() {
	window.open('/quit','_self');
}

function selectInterface() {
	var Settings = {MidiIn:document.getElementById("MidiIn").value,
					MidiOut:document.getElementById("MidiOut").value,
					MidiChan:document.getElementById("MidiChan").value,
					Mdl:Model};
	getJsonParam('/selIfc', JSON.stringify(Settings), (data) => {
		if (data.error)
			document.getElementById("Result").innerText = data.error;
		else
			document.getElementById("c").innerText = data.patch;
	});
}

function readCurrentPatch() {
	let Settings = {Mdl: Model};
	getJsonParam('/readPatch', JSON.stringify(Settings), (data) => {
		if (data.error)
			document.getElementById("Result").innerText = data.error;
		else
			document.getElementById("c").innerText = data.patch;
	});
}

function writeCurrentPatch() {
	
	let Settings = {Mdl: Model};
	getJsonParam('/writePatch', JSON.stringify(Settings), (data) => {
		if (data.error)
			document.getElementById("Result").innerText = data.error;
		else
			document.getElementById("c").innerText = data.patch;
	});
}
	
/*
 * Note: It is useless to return a 'thenable' from the function for 'getJsonParam'
 * because it will not be used.
 * This schebang is working more by chance, but the mix of recursion and sequence is not easy.
 * TODO: Find something more straight forward.
 */ 
function readMemoryBank(i, typ, followup) {
	let Settings = {Mdl: Model, Bank: i, type: typ};
	let ctrl;
	if (typ == 'S') {
		ctrl = SingleReadBanks;
	} else {
		ctrl = MultiReadBanks;
	}
	document.getElementById("Result").innerText = `Receiving synth memory ${ctrl[i]}`;
	try {
		getJsonParam('/readMemory', JSON.stringify(Settings), (data) => {
			document.getElementById("Result").innerText = data.result;
			if (data.names) {
				SynthPatches.push_pat(data.names);
			}
			do {
				i++;
			} while (i < ctrl.length && ctrl[i] == ' ');
			if (i < ctrl.length) {
				readMemoryBank(i, typ, followup);
			} else if(followup) {
				followup(i);
			}
		});
	} catch (e) {
		document.getElementById("Result").innerText = `Error reading memory banks: ${e}`;
	}
}
	
function readMemoryBanks() {
	SynthPatches.patches = [];
	var display = function(ign) {SynthPatches.displayNames(new PatId(0,0));};
	var readMultis = function(i) {readMemoryBank(0, 'M', display);};
	readMemoryBank(0, 'S', readMultis);
}

function writeMemory() {
	if (SynthPatches.curpage == undefined) {
		document.getElementById("Result").innerText = 'No page for upload';
		return;
	}
	let Settings = {Mdl: Model, bnk:SynthPatches.curpage.BankTypePrefix+SynthPatches.curpage.BankLetter};
	document.getElementById("Result").innerText = 'Writing current bank to synth';
	getJsonParam('/writeMemory', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
	});
}

function readFile() {
	var fl = new FormData(document.getElementById("readForm")).get("fname");
	var rd = new FileReader();
	rd.onloadend = function() {
		let Settings = {Mdl: Model, Cont:rd.result};
		getJsonParam( '/readFile', JSON.stringify(Settings), (data) => {
			document.getElementById("Result").innerText = data.result;
			if (data.names) {
				FilePatches.patches = data.names;
				FilePatches.displayNames(new PatId(0,0));
			}
		});
	};
	rd.readAsDataURL(fl);
}

function comparePatch() {
	var fl = new FormData(document.getElementById("compareForm")).get("cfname");
	var rd = new FileReader();
	rd.onloadend = function() {
		let Settings = {Mdl: Model, Cont:rd.result};
		getJsonParam( '/comparePatch', JSON.stringify(Settings), (data) => {
			document.getElementById("Result").innerText = data.result;
		});
	};
	rd.readAsDataURL(fl);
}

function test() {
	let Settings = {Mdl: Model};
	getJsonParam('/test', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
	});
}

function swap() {
	getJsonData('/swap?Mdl=' + Model, function() {
		SynthPatches.swap(FilePatches);
		SynthPatches.refreshDisplay();
		FilePatches.refreshDisplay();
	});
}

function allowDrop(ev) {
	ev.preventDefault();
}

function dragStart(ev) {
	ev.dataTransfer.setData("text", ev.target.innerText);
	ev.dataTransfer.setData("id", ev.target.id);
}

function drop(ev) {
	ev.preventDefault();
	if (!ev.dataTransfer) {
		document.getElementById("Result").innerText = `drop with no source from ${ev}` ;
		return;
	}
	let src_id = ev.dataTransfer.getData("id");
	let src_txt = ev.dataTransfer.getData("text");
	let dest_id = ev.target.id;
	let dest_txt = ev.target.text;
	let Settings = {
		from: Navi.serverFromTarget(src_id),
		to: Navi.serverFromTarget(dest_id),
		Mdl: Model
	};
	getJsonParam('/move', JSON.stringify(Settings), (answ) => {
		if (answ.ok) {
			document.getElementById(dest_id).innerText = answ.ok;
			if (dest_id[0] == 'S' ) SynthPatches.set_pat(Number(dest_id.substr(2)), src_txt);
			if (dest_id[0] == 'F' ) FilePatches.set_pat(Number(dest_id.substr(2)), src_txt);
			if (dest_id[0] == 'c' ) ClipboardType = dest_id[1];
		} else {
			document.getElementById("Result").innerText = answ.error;
		}
	});
}

function prepareSwitchTable() {
	SynthPatches.prepareSwitchTable("ssstab", NetSingleBanks);
	SynthPatches.prepareSwitchTable("smstab", NetMultiBanks);
	FilePatches.prepareSwitchTable("fsstab", NetSingleBanks);
	FilePatches.prepareSwitchTable("fmstab", NetMultiBanks);
}

function displayForm() {
	var Settings;
	SynthPatches = new Navi("stab","slb");
	FilePatches = new Navi("ftab","flb");
	var sel1 = document.getElementById("MidiOut");
	getJsonData('/outputs?Mdl=' + Model, (answ) => {
		answ.list.forEach((nam) => {
			var opt = document.createElement("OPTION");
			opt.text = nam;
			sel1.add(opt);
		});
		Settings = answ.settings;
		if (Settings)
			sel1.value = Settings.MidiOut;
		else
			document.getElementById("Result").innerText = answ.error;			
	});
	var sel2 = document.getElementById("MidiIn");
	getJsonData('/inputs?Mdl=' + Model, (answ) => {
		answ.list.forEach((nam) => {
			var opt = document.createElement("OPTION");
			opt.text = nam;
			sel2.add(opt);
		});
		if (Settings) {
			sel2.value = Settings.MidiIn;
			document.getElementById("MidiChan").value = Settings.MidiChan;
			document.title = Settings.name;
		} else {
			document.getElementById("Result").innerText = answ.error;			
		}
	});
	document.getElementById("readpatch").addEventListener('click',readCurrentPatch);
	document.getElementById("writepatch").addEventListener('click',writeCurrentPatch);
	document.getElementById("readMem").addEventListener('click',readMemoryBanks);
	document.getElementById("writeMem").addEventListener('click',writeMemory);
	document.getElementById("readFile").addEventListener('click',readFile);
	document.getElementById("swapbutton").addEventListener('click',swap);
	document.getElementById("test").addEventListener('click',test);
}

function test() {
	let Settings = {Mdl: Model};
	getJsonParam('/test', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
	});
}


window.addEventListener("load", displayForm);
window.addEventListener("load", prepareSwitchTable);

