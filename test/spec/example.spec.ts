import 'jasmine';

import { Ensure, includes, property, isGreaterThan } from '@serenity-js/assertions';
import { actorCalled, engage, Task, Question, Loop} from '@serenity-js/core';

import { Navigate, Website, Target, Click, Pick, Switch } from '@serenity-js/protractor';

import {by, ElementFinder, ElementArrayFinder} from 'protractor';
import { Actors } from '../src';

const tiny_types_1 = require("tiny-types");

const PageDescriptions = [
	{name: "Roland D50"},
	{name: "access virus b"},
	{name: "Korg Triton"},
];

function lookupPageDescription(Name:string) : number {
	console.log(`looking for ${Name}`)
	return PageDescriptions.findIndex((pd:any) => {
		return 	pd.name == Name;
	});
}

function toIndex(Name:Promise<string>) :Promise<number>{
        return new Promise<number>((resolve) => {
				Name.then((name) => {
					resolve(lookupPageDescription(name));
				});
			});
}

describe('Midi Patch Manager', () => {

    beforeEach(() => engage(new Actors()));
	
	class EntryPage {
		static SynthLinks = Target.all('Synth Link').located(by.css('.icon'));
		static QuitButton = Target.the('Quit Button').located(by.id('quitbutton'));
	};

	const picked = Pick.from<ElementFinder, ElementArrayFinder>(EntryPage.SynthLinks);

	const isInPageDescriptions = (frage:Question<Promise<string>>) =>
		Question.about('the website is in page descriptions', actor => {
			return toIndex(actor.answer(frage));
		});

	it(`gives us a choice of synths`, () =>
        actorCalled('Jasmine')
			.attemptsTo(
		        Navigate.to('http://localhost:10532/index.html'),
	            Ensure.that(Website.title(), includes('Midi Patch Manager')),
				Ensure.that(EntryPage.SynthLinks, property('length', isGreaterThan(0))),
				Loop.over(EntryPage.SynthLinks).to(        
					Click.on(Loop.item()),
					Switch.toNewWindow(),
		            Ensure.that(isInPageDescriptions(Website.title()), isGreaterThan(-1)),
					Switch.toOriginalWindow(),
				)		
			)
	);

});

