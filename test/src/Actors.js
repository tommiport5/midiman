"use strict";
exports.__esModule = true;
exports.Actors = void 0;
var protractor_1 = require("@serenity-js/protractor");
var protractor_2 = require("protractor");
var Actors = /** @class */ (function () {
    function Actors() {
    }
    Actors.prototype.prepare = function (actor) {
        return actor.whoCan(protractor_1.BrowseTheWeb.using(protractor_2.protractor.browser));
    };
    return Actors;
}());
exports.Actors = Actors;
