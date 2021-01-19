import 'jasmine';

import { Ensure, includes, property, isGreaterThan, Check, equals, not, Expectation, or } from '@serenity-js/assertions';
import { actorCalled, Duration, engage, Log, Loop, Question, Task } from '@serenity-js/core';
import { Navigate, Website, Target, Click, Switch, Text, Enter, Wait, Attribute, Pick, DoubleClick } from '@serenity-js/protractor';
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
	static SynthBox = Target.the('SynthBox').located(by.id('synth'));	
	static Result = Target.the('message line').located(by.id('Result'));
	static InputFileName = Target.the('InputFileName').located(by.id('fname'));
	static ReadFileButton = Target.the('ReadFileButton').located(by.id('readFile'));
	static WriteFileButton = Target.the('WriteFileButton').located(by.id('writeFile'));
	static ReadMemoryButton = Target.the('ReadMemoryButton').located(by.id('readMem'));
	static FilePatches = Target.all('FilePatches').of(SynthCommon.FileBox).located(by.className('pname'));
	static FileBankButtons = Target.all('FileBankButtons').of(SynthCommon.FileBox).located(by.className('lbb'));
	static SwapButton =  Target.the('SwapButton').located(by.id('swapbutton'));
	static SynthPatches = Target.all('SynthPatches').of(SynthCommon.SynthBox).located(by.className('pname'));
	static SynthBankButtons = Target.all('SynthBankButtons').of(SynthCommon.SynthBox).located(by.className('lbb'));
	static TestButton = Target.the('TestButton').located(by.id('test'));
	static CompareButton = Target.the('CompareButton').located(by.id('compareButton'));
}

var globalScope = global as any;
globalScope.jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000000;

const FirstSynthPatch = Pick.from<ElementFinder, ElementArrayFinder>(SynthCommon.SynthPatches).first();
//const picked = Pick.from<ElementFinder, ElementArrayFinder>(SynthRoland.FilePatches);



const readSoundFile = (SoundFileName: Question<Promise<string>>) =>
	Task.where(`#actor reads a file of sound patches`,
			Enter.theValue(SoundFileName).into(SynthCommon.InputFileName),	
			Click.on(SynthCommon.ReadFileButton),
			Wait.upTo(Duration.ofSeconds(15)).until(Text.of(SynthCommon.Result), includes('Successfull')),
);

const readMemoryFromSynth = () => 
	Task.where(`#actor read Memory from synth`,
		Click.on(SynthCommon.ReadMemoryButton),
		Wait.upTo(Duration.ofMinutes(5)).until(Text.of(SynthCommon.Result), includes('Successfull')),
	);
 
const testSimplePatchTransfer = (Patches: TargetElements) =>
	Task.where(`#actor transfers patches and checks their integrity`,
			Loop.over(Patches).to(
				dragndrop.DragAndDrop(Loop.item()).onto(SynthCommon.Clipboard),
				Click.on(SynthCommon.TestButton),
				Wait.for(Duration.ofSeconds(1)),
				Check.whether(Text.of(SynthCommon.Result), includes('changed from'))
					.andIfSo(
						Log.the(Text.of(Loop.item()), Text.of(SynthCommon.Result)),
					),
			),	
	);

const testMultiPatchTransfer = (BankButtons: TargetNestedElements, Patches: TargetNestedElements) =>
	Task.where(`#actor transfers patches and checks their integrity`,
			Loop.over(BankButtons).to(
				Click.on(Loop.item()),	
				//helpers.rememberTheButton(Loop.item()),	
				DoubleClick.on(FirstSynthPatch),		//to changed Prog/Combi, must be the SynthPatches in any case
				//Log.the(Attribute.of(Loop.item()).called('id'), helpers.BankLoopItem.getInstance()),   
				Loop.over(Patches).to(
					Check.whether(Attribute.of(Loop.item()).called('draggable'), equals('true'))
						.andIfSo(
						dragndrop.DragAndDrop(Loop.item()).onto(SynthCommon.Clipboard),
						Wait.for(Duration.ofSeconds(1)),
						Click.on(SynthCommon.TestButton),
						Wait.until(Text.of(SynthCommon.Result), not(equals(''))),
						Ensure.that(Text.of(SynthCommon.Result), Expectation.to('pass').soThatActual(or(
															includes('compared equ'),
															includes('version changed')))),
//							.andIfSo(
//								Log.the(Text.of(Loop.item()), Text.of(SynthCommon.Result)),
//						),
					),
				), 
			),
		);
		
const compareMemory = (BankButtons: TargetNestedElements, Patches: TargetNestedElements) =>
	Task.where(`#actor compares current patches against their equivalent in memory`,
			Loop.over(BankButtons).to(
				Click.on(Loop.item()),
				//helpers.rememberTheButton(Loop.item()),	
				Loop.over(Patches).to(
					Check.whether(Attribute.of(Loop.item()).called('draggable'), equals('true'))
						.andIfSo(
						DoubleClick.on(Loop.item()),
						Wait.upTo(Duration.ofSeconds(5)).until(Text.of(SynthCommon.Result), includes('Ok')),
						Click.on(SynthCommon.CompareButton),
						Wait.until(Text.of(SynthCommon.Result), not(equals(''))),
						Ensure.that(Text.of(SynthCommon.Result), includes('compared equal')),
//							.andIfSo(
//								Log.the(Text.of(Loop.item()), Text.of(SynthCommon.Result)),
//						),
					),
				), 
			),
		);
 

describe('Midi Patch Manager', () => {
	

    beforeEach(() => engage(new Actors()));


	it(`gives us a choice of synths`, () =>
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

	it('safely sends and receives Roland patches', () =>
        actorCalled('Jasmine')
		.attemptsTo(
            Navigate.to('http://localhost:10532/Synths/Roland D50.html'),
			readSoundFile(helpers.getConfigString(Website.title(), 'sysex')),
			testSimplePatchTransfer(SynthRoland.FilePatches),
        ));

	it('safely sends and receives access patches', () =>
        actorCalled('Jasmine')
		.attemptsTo(
            Navigate.to('http://localhost:10532/Synths/access virus b.html'),
			readSoundFile(helpers.getConfigString(Website.title(), 'sysex')),
 			testMultiPatchTransfer(SynthCommon.FileBankButtons, SynthCommon.FilePatches),
       ));

/*
	xit('compares received Korg patches to the stored values', () =>
        actorCalled('Jasmine')
		.attemptsTo(
            Navigate.to('http://localhost:10532/Synths/Korg Triton.html'),	
			readSoundFile(helpers.getConfigString(Website.title(), 'sysex')),
			Click.on(SynthCommon.SwapButton),
			compareMemory(SynthCommon.SynthBankButtons, SynthCommon.SynthPatches),
       ));
*/
	it('safely sends and receives Korg patches', () =>
        actorCalled('Jasmine')
		.attemptsTo(
            Navigate.to('http://localhost:10532/Synths/Korg Triton.html'),	
			readSoundFile(helpers.getConfigString(Website.title(), 'sysex')),
			Click.on(SynthCommon.SwapButton),
			testMultiPatchTransfer(SynthCommon.SynthBankButtons, SynthCommon.SynthPatches),
       ));

});

