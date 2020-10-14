"use strict"

const port = 10532;

const NumReadBanks = 8;
const defaultBorderstyle = "outset";
const highlightBorderstyle = "inset";
const ButtonLabels = "ABCDEFGH";
const ButtonPrefix = "SF";

/**
 * class Navi
 * organizes the navigation and drag'n'drop on the patch tables.
 * Provides ids for the patches on server side and on ui side.
 * Patches on the server are organized in 8 banks @ 128 patches.
 * Patches on the ui side are organized in 8 banks @ 2 pages @ 64 patches.
 * Additionaly, there are 2 slots for the synth patches and the file patches, so
 * there is one instance for the SynthPatches and one for the FilePatches.
 * One extra patch is for the clipboard. A side consideration is that HTML element 
 * ids should be unique on a page and should not be changed once they are assigned.
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
	// The current page member consists of the instance prefix(S or F), the bank letter (A - H) and the page number (0 or 1)
	// Its serves as the id for the select button.
	get curpage() {return this._curpage;}
	set curpage(pg) {
		// make it suitable on the fly
		if (pg) {
			this._curpage = this._buttonPrefix() + pg.slice(1);
		} else {
			this._curpage = undefined;
		}
	}
	
	push_pat(pat) {this._patches.push(pat);}
	set_pat(pnum, text) {
		let bank = ButtonLabels.indexOf(this.curpage.substr(1,1));
		if (this.curpage.charAt(2) == 2) pnum += 64;
		this._patches[bank][pnum] = text;
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
		if (this.curpage) document.getElementById(this.curpage).style.borderStyle = defaultBorderstyle;
		if (rOther.curpage) document.getElementById(rOther._curpage).style.borderStyle = defaultBorderstyle;
		tmp = this.curpage;
		this.curpage = rOther.curpage;
		rOther.curpage = tmp;
	}
	
	/**
	 * prepareSwitchTable 
	 * only do it once for each instance!
	 */
	prepareSwitchTable() {
		let arr = document.getElementsByClassName(this._seltab);
		for (let i=0; i < arr.length; i++) {
			let digit = i % 2 + 1;
			let btn = document.createElement("button");
			btn.type = "button";
			let bank = Math.trunc(i/2);
			let page = digit - 1;
			btn.onclick = this._makeDisplayNames(bank, page);
			btn.innerText = ButtonLabels[Math.trunc(i/2)] + digit;
			btn.id = this._buttonPrefix(this._seltab) + btn.innerText;
			arr[i].appendChild(btn);
		}
	}
	
	/**
	 * refreshDisplay
	 * extracts bank and page from curpage and calls displayNames.
	 */
	refreshDisplay() {
		var bank;
		var page;
		if (this._curpage == undefined) {
			bank = page = 0;	// erase display
		} else {
			bank = ButtonLabels.indexOf(this._curpage[1]);
			page = Math.trunc(this._curpage[2]-1);
		}
		this.displayNames(bank, page);
	}
	
	displayNames(bank, page) {
		var arr = this._pelem.querySelectorAll(".pname");
		var ind = this._pelem.querySelectorAll(".pnh");
		var i = 0;
		var startAt;
		var tabdat;
		this._highlightButton(bank, page);
		if (this._patches == undefined) {
			for (;i<arr.length;) {
				arr[i++].innerText = "";
			}
			return;
		}
		if (page == 0) {
			for (let n=0; n<ind.length; n++) {
				ind[n].innerText = n.toString() + "_";
			}
			startAt = 0;
		} else {
			for (let n=0; n<ind.length; n++) {
				ind[n].innerText = (n+6).toString() + "_";
			}
			startAt = 4;
		}
		for (; i<startAt;) {
			arr[i].innerText = "";
			arr[i].setAttribute("draggable", false);
			arr[i++].removeAttribute("ondragstart");
		}
		let btab = this._patches[bank];
		if (btab && page == 0) {
			tabdat = btab.slice(0,64);
		} else if (btab) {
			tabdat = btab.slice(64);
		}
		if (tabdat) {
			tabdat.forEach((dt) => {
				arr[i].innerText = dt;
				arr[i].setAttribute("draggable", true);
				arr[i].id = this._buttonPrefix() + i;	
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
	 * prepareDnd !!!obsolete, is done during displayNames
	 * Assigns ids to the drop sources and targets.
	 * The ids must be different for file and synth, but independent of the currently displayed page,
	 * so they are "S" or "F" followed by the patch number 0-63.
	 */
	prepareDnD() {
		var arr = this._pelem.querySelectorAll(".pname");
		for (var i=0; i < arr.length; i++) {
			arr[i].setAttribute("draggable", true);
			arr[i].id = this._buttonPrefix() + i;	
			arr[i].setAttribute("ondragstart","dragStart(event)");
		}
	}
	
	/**
	 * serverFromTarget
	 * determines the patch id for the server from the curpage and the drop target (or drop source).
	 * The current page member consists of the instance prefix(S or F), the bank letter (A - H) and the page number (0 or 1).
	 * The drop targets/sources are "S" or "F" followed by the patch number 0-69. (Take care of the "decimal view"!)
	 * The server string takes the form [sf][A-H]\d{1,3} with the number in the range 0-127.
	 * A special case is the clipboard, which has only "c" as the server string.
	 */
	static serverFromTarget(tg) {
		var sv;
		var num;
		switch (tg.charAt(0)) {
			case "c":
				return "c";
			case "S":
				sv = "s" + SynthPatches.curpage.substr(1,1);
				num = Number(tg.substr(1));
				if (SynthPatches.curpage.charAt(2) == 2) num += 60;
				return sv + num;
			case "F":
				sv = "f" + FilePatches.curpage.substr(1,1);
				num = Number(tg.substr(1));
				if (FilePatches.curpage.charAt(2) == 2) num += 60;
				return sv + num;
		}
		
	}
	
	_buttonPrefix() {
		if (this._seltab == "slb") return ButtonPrefix[0];
		else return ButtonPrefix[1];
	}
	
	_highlightButton(bank, page) {
		if (this._curpage) {
			document.getElementById(this._curpage).style.borderStyle = defaultBorderstyle;
		}
		let pstring = this._buttonPrefix();
		pstring += ButtonLabels[bank] + (page+1);
		this._curpage = pstring;
		document.getElementById(this._curpage).style.borderStyle = highlightBorderstyle;
	}
	
	_makeDisplayNames(bank, page) {
		var This = this;
		return function() {
			This.displayNames(bank, page);
		};
	}
	
}


var SynthPatches;
var FilePatches; 

function forcequit() {
  var xhttp = new XMLHttpRequest();
  xhttp.open("GET", 'http://localhost:' + port + '/forcequit', true);
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
	window.open('http://localhost:' + port + '/quit','_self');
}

function selectInterface() {
	var Settings = {MidiIn:document.getElementById("MidiIn").value,
					MidiOut:document.getElementById("MidiOut").value,
					MidiChan:document.getElementById("MidiChan").value,
					Mdl:Model};
	getJsonParam('http://localhost:' + port +'/selIfc', JSON.stringify(Settings), (data) => {
		if (data.error)
			document.getElementById("Result").innerText = data.error;
		else
			document.getElementById("c").innerText = data.patch;
	});
}

function readCurrentPatch() {
	let Settings = {Mdl: Model};
	getJsonParam('http://localhost:' + port +'/readPatch', JSON.stringify(Settings), (data) => {
		if (data.error)
			document.getElementById("Result").innerText = data.error;
		else
			document.getElementById("c").innerText = data.patch;
	});
}

function writeCurrentPatch() {
	
	let Settings = {Mdl: Model};
	getJsonParam('http://localhost:' + port +'/writePatch', JSON.stringify(Settings), (data) => {
		if (data.error)
			document.getElementById("Result").innerText = data.error;
		else
			document.getElementById("c").innerText = data.patch;
	});
}
	
function readMemoryBank(i) {
	let Settings = {Mdl: Model, Bank: i};
	document.getElementById("Result").innerText = `Receiving memory ${ButtonLabels[i]}`;
	getJsonParam('http://localhost:' + port +'/readMemory', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
		if (data.names) {
			SynthPatches.push_pat(data.names);
		}
		if (++i < NumReadBanks) readMemoryBank(i);
		else SynthPatches.displayNames(0, 0);

	});
}	
function readMemoryBanks() {
	SynthPatches.patches = [];
	readMemoryBank(0);
}

function writeMemory() {
	let Settings = {Mdl: Model};
	document.getElementById("Result").innerText = 'Writing bank A and B to synth';
	getJsonParam('http://localhost:' + port +'/writeMemory', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
	});
}

function readFile() {
	var fl = new FormData(document.getElementById("readForm")).get("fname");
	var rd = new FileReader();
	rd.onloadend = function() {
		let Settings = {Mdl: Model, Cont:rd.result};
		getJsonParam('http://localhost:' + port + '/readFile', JSON.stringify(Settings), (data) => {
			document.getElementById("Result").innerText = data.result;
			if (data.names) {
				FilePatches.patches = data.names;
				FilePatches.displayNames(0, 0);
			}
		});
	};
	rd.readAsDataURL(fl);
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
	if (dest_id[0] == 'S' ) SynthPatches.set_pat(Number(dest_id.substr(1)), src_txt);
	if (dest_id[0] == 'F' ) FilePatches.set_pat(Number(dest_id.substr(1)), src_txt);
	let Settings = {
		from: Navi.serverFromTarget(src_id),
		to: Navi.serverFromTarget(dest_id),
		Mdl: Model
	};
	getJsonParam('http://localhost:' + port +'/move', JSON.stringify(Settings), (answ) => {
		if (answ.result == 'Ok') {
			document.getElementById(dest_id).innerText = src_txt;
		} else {
			document.getElementById("Result").innerText = answ.result;
		}
	});
}

function prepareSwitchTable() {
	SynthPatches.prepareSwitchTable();
	FilePatches.prepareSwitchTable();
}

function prepareDnd() {
	SynthPatches.prepareDnD();
	FilePatches.prepareDnD();
}

function displayForm() {
	var Settings;
	SynthPatches = new Navi("stab","slb");
	FilePatches = new Navi("ftab","flb");
	var sel1 = document.getElementById("MidiOut");
	getJsonData('http://localhost:' + port +'/outputs?Mdl=' + Model, (answ) => {
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
	getJsonData('http://localhost:' + port +'/inputs?Mdl=' + Model, (answ) => {
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
	//document.getElementById("selInterface").addEventListener('click',selectInterface);
	document.getElementById("readMem").addEventListener('click',readMemoryBanks);
	document.getElementById("writeMem").addEventListener('click',writeMemory);
	document.getElementById("readFile").addEventListener('click',readFile);
	document.getElementById("swapbutton").addEventListener('click',swap);
	// prepareDnd();
}

window.addEventListener("load", displayForm);
window.addEventListener("load", prepareSwitchTable);

