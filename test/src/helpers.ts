
export { getConfigString,  isInPageDescriptions, toIndex};
import { Interaction, Log, Loop, Question} from '@serenity-js/core';
import { MappingFunction } from '@serenity-js/core/lib/io/collections';
import { Attribute, Target } from '@serenity-js/protractor';




const PageDescriptions = [
	{name: 'Roland D50', sysex: 'C:\\Users\\Dad\\Documents\\SysEx\\D50\\Extern\\SYNTH4&5.D50'},
	{name: 'access virus b', sysex: 'C:\\Users\\Dad\\Documents\\SysEx\\virus\\Basic.ref.virus.syx'},
	{name: 'Korg Triton', sysex: 'C:\\Users\\Dad\\Documents\\SysEx\\Korg\\BasicTE.ref.syx'},
];	


function lookupPageDescription(Name: string): number {
	//console.log(`looking for ${Name}`);
	return PageDescriptions.findIndex((pd:any) => {
		return 	pd.name === Name;
	});
}

function toIndex(Name: Promise<string>): Promise<number>{
    return new Promise<number>(resolve => {
		Name.then(name => {
			resolve(lookupPageDescription(name));
		});
	});
}
/*
function lookupConfigString(key: Promise<string>, name: string) :Promise<string> {
	return new Promise<string>(resolve => {
		key.then(sKey => {
			console.log(`${sKey}: ${name}`);
			resolve(PageDescriptions[lookupPageDescription(sKey)][name]);
		}).catch(err => {
			Log.the(err);
		});
	});
}
*/
function mapConfigString(item: string) :MappingFunction<string, string>  {
	return (key => {
		return PageDescriptions[lookupPageDescription(key)][item];
	});
}

function makeMCS(item: string) {
	let mf = function() {
		return mapConfigString(item);
	};
	return mf;
}

function getConfigString(key: Question<Promise<string>>, item: string): Question<Promise<string>> {
	return key.map(makeMCS(item));
}

	
const isInPageDescriptions = (frage: Question<Promise<string>>) =>
	Question.about('the website is in page descriptions', actor => {
		return toIndex(actor.answer(frage));
	});

/*	
export function moveSpecFromItem(item) {
	let target_id = Attribute.of(item).called('id').toString();
		let sv = target_id[0].toLowerCase();
		sv += this.BankTypePrefix;
		sv += this.BankLetter;
		let num = Number(target_id.substr(2));
		if (this.page) num += 60;	// patchnumbers on page 2 start at 60!
		return sv + num;
}	
*/

/**
 * BankSelector
 * provides a method to select a bank, loop over the selector buttons and construct the resulting parameters
 * for the move function. 
 */	
export class BankLoopItem  {
	static theInstance = undefined;
    private _BankTypePrefix: any;
    private _BankLetter: any;
    private _Page: number;

	get page() {
		return this._Page;
	}

	static getInstance() {
		return BankLoopItem.theInstance;	
	}
	
	static remember(id) {
		BankLoopItem.theInstance = new BankLoopItem(id);
	}
	
	constructor(id) {
		this._BankTypePrefix = id[1];
		this._BankLetter = id[2];
		this._Page = Number(id[3]) - 1;
	}
	
	/* 
	 * moveSpecFromItem
     * calculate the mov target from the ftab-id of item
	 * and the banl selector butto this._id
	 */
	moveSpecFromItem(target_id) {
		let sv = target_id[0].toLowerCase();
		sv += this._BankTypePrefix;
		sv += this._BankLetter;
		let num = Number(target_id.substr(2));
		if (this._Page) num += 60;	// patchnumbers on page 2 start at 60!
		return sv + num;
	} 
	
	
}

export const rememberTheButton = (item) =>
	Interaction.where(`#actor remembers the clicked button`, (actor) => {
			actor.answer(Attribute.of(item).called('id')).then((id) => {
				BankLoopItem.remember(id);
				});
			});

export const moveSpecFromItem = (item) =>
	Question.about(`#actor calculates the move spec`, (actor): Promise<string> => {
		return new Promise((resolve) => {
			actor.answer(Attribute.of(item).called('id')).then((id) => {
				let spec = BankLoopItem.getInstance().moveSpecFromItem(id);
				//Log.the(spec);
				resolve(spec);
			});
		});
	});
	