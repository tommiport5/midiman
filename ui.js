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

function checkDevice() {
	var Settings = {MidiIn:document.getElementById("MidiIn").value,
					MidiOut:document.getElementById("MidiOut").value,
					MidiChan:document.getElementById("MidiChan").value};
	getJsonParam('http://localhost:' + port +'/check', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
	});
}

function readPatch() {
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

function displayNames(tab, src) {
	var arr = document.getElementsByClassName(tab);
	var i = 0;
	if (src) {
		src.forEach((dt) => {
			arr[i++].innerText = dt;
		});
	} 
	for (;i<arr.length;) {
		arr[i++].innerText = "";
	}
}
	
	
function readMemory() {
	var Settings = {MidiIn:document.getElementById("MidiIn").value,
					MidiOut:document.getElementById("MidiOut").value,
					MidiChan:document.getElementById("MidiChan").value
					};
	document.getElementById("Result").innerText = 'On the D50 press "Data Transfer/B.Dump/Enter" and wait while the D50 displays "Sending"';
	getJsonParam('http://localhost:' + port +'/readMemory', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
		if (data.names) {
			displayNames("spname", data.names);
			SynthPatches = data.names;
		}
	});
}

function writeMemory() {
	var Settings = {MidiIn:document.getElementById("MidiIn").value,
					MidiOut:document.getElementById("MidiOut").value,
					MidiChan:document.getElementById("MidiChan").value
					};
	document.getElementById("Result").innerText = 'On the D50 press "Data Transfer/B.Load/Enter" and wait while the D50 displays "Loading"';
	getJsonParam('http://localhost:' + port +'/writeMemory', JSON.stringify(Settings), (data) => {
		document.getElementById("Result").innerText = data.result;
	});
}

function readFile() {
	var fl = new FormData(document.getElementById("readForm")).get("fname");
	var rd = new FileReader();
	rd.onloadend = function() {
		getJsonParam('http://localhost:' + port + '/readFile', JSON.stringify(rd.result), (data) => {
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
	getJsonData('/swap', function() {
		displayNames("spname", SynthPatches);	
		displayNames("fpname", FilePatches);
	});
}

function threebyte2num(arr) {
	return 0x80*(0x80*arr[0] + arr[1]) + arr[2];
}

function _to3Byte(num) {
	var res = [0,0,0];
	var n = Math.round(num);
	res[2] = num % 0x80;
	res[1] = Math.trunc(n/0x80 % 0x80);
	res[0] = Math.trunc(n/(0x80*0x80) % 0x80);
	return res;
}

function patch2Mem(bank, pn) {
	return threebyte2num([2,0,0]) + (bank*8+pn)*448;
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
	// alert('Dragging from ' + src_id + ' (' + src_txt + ') ' + ' to ' + dest_id + ' (' + dest_txt + ') ');
	var Settings = {
		from: src_id,
		to: dest_id
	};
	getJsonParam('http://localhost:' + port +'/move', JSON.stringify(Settings), (answ) => {
		if (answ.result == 'Ok') {
			document.getElementById(dest_id).innerText = src_txt;
		} else {
			document.getElementById("Result").innerText = answ.result;
		}
	});
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
	
function displayForm() {
	var sel1 = document.getElementById("MidiOut");
	getJsonData('http://localhost:' + port +'/outputs', (data) => {
		data.forEach((name) => {
			var opt = document.createElement("OPTION");
			opt.text = name;
			sel1.add(opt);
		});
	});
	var sel2 = document.getElementById("MidiIn");
	getJsonData('http://localhost:' + port +'/inputs', (data) => {
		data.forEach((name) => {
			var opt = document.createElement("OPTION");
			opt.text = name;
			sel2.add(opt);
		});
	});
	document.getElementById("checkbutton").addEventListener('click',checkDevice);
	//document.getElementById("readbutton").addEventListener('click',readPatch);
	document.getElementById("readMem").addEventListener('click',readMemory);
	document.getElementById("writeMem").addEventListener('click',writeMemory);
	document.getElementById("quitbutton").addEventListener('click',quit);
	document.getElementById("readFile").addEventListener('click',readFile);
	document.getElementById("swapbutton").addEventListener('click',swap);
	prepareDnd();
	window.addEventListener('beforeunload',forcequit);
}

window.onload = displayForm;