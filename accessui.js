"use strict"

const port = 10532;

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
					error = "JSON parse error";
					detail = e.name;
				}
			} else {
				error = "HTML error";
				detail = this.status;
				
			}
			alert("Did not receive json data from " + url + ", error: " + error + ", detail:" + detail);
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
	getJsonParam('http://localhost:' + port +'/check', JSON.stringify(Settings), (data) => {
		if (data.error)
			document.getElementById("Result").innerText = data.error;
		else
			document.getElementById("c").innerText = data.patch;
	});
}

/*
function readPatchByNumber() {
	var Settings = {MidiIn:document.getElementById("MidiIn").value,
					MidiOut:document.getElementById("MidiOut").value,
					MidiChan:document.getElementById("MidiChan").value,
					bank:document.getElementById("bank").value,
					pnum:document.getElementById("patch").value,
					};
	getJsonParam('http://localhost:' + port +'/read', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
	});
}
*/
	
function readMemoryBank(i) {
	let Settings = {Mdl: Model, Bank: i};
	document.getElementById("Result").innerText = `Receiving bank ${i+1}`;
	getJsonParam('http://localhost:' + port +'/readMemory', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
		if (data.names) {
			SynthPatches.push(data.names);
		}
		if (++i < 8) readMemoryBank(i);
		else displayNames("spname", SynthPatches, 0, 0);

	});
}	
function readMemoryBanks() {
	SynthPatches = [];
	readMemoryBank(0);
}

function writeMemory() {
	let Settings = {Mdl: Model};
	document.getElementById("Result").innerText = 'On the D50 press "Data Transfer/B.Load/Enter" and wait while the D50 displays "Loading"';
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
				displayNames("fpname", data.names);
				FilePatches = data.names;
			}
		});
	};
	rd.readAsDataURL(fl);
}

function swap() {
	let tmp = SynthPatches;
	SynthPatches = FilePatches;
	FilePatches = tmp;
	getJsonData('/swap?Mdl=' + Model, function() {
		displayNames("spname", SynthPatches);	
		displayNames("fpname", FilePatches);
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
	let src_id = ev.dataTransfer.getData("id");
	let src_txt = ev.dataTransfer.getData("text");
	let dest_id = ev.target.id;
	let dest_txt = ev.target.text;
	if (dest_id[0] == 's' ) SynthPatches[dest_id.substr(1)] = src_txt;
	if (dest_id[0] == 'f' ) FilePatches[dest_id.substr(1)] = src_txt;
	let Settings = {
		from: src_id,
		to: dest_id,
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

function displayNames(tab, src, bank, page) {
	var arr = document.getElementsByClassName(tab);
	var i = 0;
	var tabdat;
	let btab = src[bank];
	if (btab && page == 0) {
		tabdat = btab.slice(0,64);
	} else if (btab) {
		tabdat = btab.slice(64);
	}
	if (tabdat) {
		tabdat.forEach((dt) => {
			arr[i++].innerText = dt;
		});
	} 
	for (;i<arr.length;) {
		arr[i++].innerText = "";
	}
}

function prepareDnd() {
	var i;
	var arr = document.getElementsByClassName("spname");
	for (i=0; i < arr.length; i++) {
		arr[i].setAttribute("draggable", true);
		arr[i].id = "s" + i;
		arr[i].setAttribute("ondragstart","dragStart(event)");
	}
	arr = document.getElementsByClassName("fpname");
	for (i=0; i < arr.length; i++) {
		arr[i].setAttribute("draggable", true);
		arr[i].id = "f" + i;
		arr[i].setAttribute("ondragstart","dragStart(event)");
	}	
}

// closure
function makeDisplayNames(bank, page) {
	return function() {
		displayNames("spname", SynthPatches, bank, page);
	}
}

const ButtonLabels = "ABCDEFGH";
function prepareSwitchTable() {
	var i;
	var arr = document.getElementsByClassName("slb");
	for (i=0; i < arr.length; i++) {
		let digit = i % 2 + 1;
		let btn = document.createElement("button");
		btn.type = "button";
		let bank = Math.trunc(i/2);
		let page = digit - 1;
		btn.onclick = makeDisplayNames(bank, page);
		btn.innerText = ButtonLabels[Math.trunc(i/2)] + digit
		arr[i].appendChild(btn);
	}
}
	
function displayForm() {
	var Settings;
	var sel1 = document.getElementById("MidiOut");
	getJsonData('http://localhost:' + port +'/outputs?mdl=' + Model, (answ) => {
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
	getJsonData('http://localhost:' + port +'/inputs?mdl=' + Model, (answ) => {
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
	document.getElementById("checkbutton").addEventListener('click',readCurrentPatch);
	document.getElementById("selInterface").addEventListener('click',selectInterface);
	//document.getElementById("writepatch").addEventListener('click',);
	document.getElementById("readMem").addEventListener('click',readMemoryBanks);
	document.getElementById("writeMem").addEventListener('click',writeMemory);
	document.getElementById("readFile").addEventListener('click',readFile);
	document.getElementById("writeFile").href = "http://localhost:10532/writeFile.syx?Mdl=" + Model;
	document.getElementById("swapbutton").addEventListener('click',swap);
	prepareDnd();
}

window.addEventListener("load", displayForm);
window.addEventListener("load", prepareSwitchTable);

