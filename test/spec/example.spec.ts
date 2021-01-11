import 'jasmine';

import { Ensure, includes, property, isGreaterThan, Check, equals, not } from '@serenity-js/assertions';
import { actorCalled, Duration, engage, Log, Loop, Task } from '@serenity-js/core';
import { Navigate, Website, Target, Click, Switch, Text, Enter, Wait, Attribute, Pick } from '@serenity-js/protractor';
import { by, ElementArrayFinder, ElementFinder } from 'protractor';
import {Actors} from '../src';
import * as helpers from '../src/helpers';
import * as dragndrop from '../src/dragndrop';
import { TargetElements, TargetNestedElements } from '@serenity-js/protractor/lib/screenplay/questions/targets';

export {SynthCommon};

class EntryPage {
	static SynthLinks = Target.all('Synth Link').located(by.css('.icon'));
	static QuitButton = Target.the('Quit Button').located(by.id('quitbutton'));
}

class SynthRoland {
	static FilePatches = Target.all('FilePatches').located(by.className('fpname'));	
}

class SynthCommon {	
	static Clipboard = Target.the('Clipboard').located(by.id('c'));
	static FileBox = Target.the('FileBox').located(by.id('file'));	
	static Result = Target.the('message line').located(by.id('Result'));
	static InputFileName = Target.the('InputFileName').located(by.id('fname'));
	static ReadFileButton = Target.the('ReadFileButton').located(by.id('readFile'));
	static FilePatches = Target.all('FilePatches').of(SynthCommon.FileBox).located(by.className('pname'));
	static FileBankButtons = Target.all('FileBankButtons').of(SynthCommon.FileBox).located(by.className('lbb'));
	static TestButton = Target.the('TestButton').located(by.id('test'));
}

var globalScope = global as any;
globalScope.jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000000;

const picked = Pick.from<ElementFinder, ElementArrayFinder>(SynthCommon.FileBankButtons);
//const picked = Pick.from<ElementFinder, ElementArrayFinder>(SynthRoland.FilePatches);

const readSoundFile = () =>
	Task.where(`#actor reads a file of sound patches`,
			Enter.theValue(helpers.getConfigString(Website.title(), 'sysex')).into(SynthCommon.InputFileName),	
			Click.on(SynthCommon.ReadFileButton),
			Wait.upTo(Duration.ofSeconds(15)).until(Text.of(SynthCommon.Result), includes('Successfull')),
);
 
const testSimplePatchTransfer = (FilePatches: TargetElements) =>
	Task.where(`#actor transfers patches and checks their integrity`,
			Loop.over(FilePatches).to(
				/*
				rest.SendMoveRequest(helpers.getConfigString(Website.title(), 'name'),
					Attribute.of(Loop.item()).called('id')),*/
				dragndrop.DragAndDrop(Loop.item()).onto(SynthCommon.Clipboard),
				Click.on(SynthCommon.TestButton),
				Wait.for(Duration.ofSeconds(1)),
				Check.whether(Text.of(SynthCommon.Result), includes('changed from'))
					.andIfSo(
						Log.the(Text.of(Loop.item()), Text.of(SynthCommon.Result)),
					),
			),	
	);

const testMultiPatchTransfer = (FilePatches: TargetNestedElements) =>
	Task.where(`#actor transfers patches and checks their integrity`,
			//Loop.over(SynthCommon.FileBankButtons).to(
				Click.on(picked.get(0)),	//Loop.item()
				helpers.rememberTheButton(picked.get(0)),	//Loop.item
				//Log.the(Attribute.of(Loop.item()).called('id'), helpers.BankLoopItem.getInstance()),   
				Loop.over(FilePatches).to(
					Check.whether(Attribute.of(Loop.item()).called('draggable'), equals('true'))
						.andIfSo(
						dragndrop.DragAndDrop(Loop.item()).onto(SynthCommon.Clipboard),
						Wait.for(Duration.ofSeconds(1)),
						Click.on(SynthCommon.TestButton),
						Wait.until(Text.of(SynthCommon.Result), not(equals(''))),
						Check.whether(Text.of(SynthCommon.Result), not(includes('compared equ')))
							.andIfSo(
								Log.the(Text.of(Loop.item()), Text.of(SynthCommon.Result)),
						),
					),
				), 
		//	),
		);
 

describe('Midi Patch Manager', () => {
	

    beforeEach(() => engage(new Actors()));


	xit(`gives us a choice of synths`, () =>
        actorCalled('Jasmine')
			.attemptsTo(
		        Navigate.to('http://localhost:10532/index.html'),
	            Ensure.that(Website.title(), includes('Midi Patch Manager')),
				Ensure.that(EntryPage.SynthLinks, property('length', isGreaterThan(0))),
				Loop.over(EntryPage.SynthLinks).to(
					Click.on(Loop.item()),
					Switch.toNewWindow(),
		            Ensure.that(helpers.isInPageDescriptions(Website.title()), isGreaterThan(-1)),
					Switch.toOriginalWindow(),
				),
				Click.on(EntryPage.QuitButton),	
				Ensure.that(Text.of(Target.the('body').located(by.css('body'))),includes('Bye')),	
			)
	);

	xit('safely sends and receives Roland patches', () =>
        actorCalled('Jasmine')
		.attemptsTo(
            Navigate.to('http://localhost:10532/Synths/Roland D50.html'),
			readSoundFile(),
			testSimplePatchTransfer(SynthRoland.FilePatches),
        ));

	xit('safely sends and receives access patches', () =>
        actorCalled('Jasmine')
		.attemptsTo(
            Navigate.to('http://localhost:10532/Synths/access virus b.html'),
			readSoundFile(),
 			testMultiPatchTransfer(SynthCommon.FilePatches),
       ));

	it('safely sends and receives access patches', () =>
        actorCalled('Jasmine')
		.attemptsTo(
            Navigate.to('http://localhost:10532/Synths/Korg Triton.html'),
			readSoundFile(),
 			testMultiPatchTransfer(SynthCommon.FilePatches),
       ));

});
