'use strict';

window.WindingHistory = class {
    constructor(limit=20) {this.limit=limit;this.reset('');}
    reset(value,start=0,end=start) {this.states=[{value,start,end}];this.index=0;}
    select(start,end) {Object.assign(this.states[this.index],{start,end});}
    record(value,start,end) {
        if (this.states[this.index].value===value) {this.select(start,end);return;}
        this.states.splice(this.index+1);
        this.states.push({value,start,end});
        if(this.states.length>this.limit+1)this.states.shift();
        this.index=this.states.length-1;
    }
    get canUndo() {return this.index>0;}
    get canRedo() {return this.index<this.states.length-1;}
    undo() {return this.canUndo ? this.states[--this.index] : null;}
    redo() {return this.canRedo ? this.states[++this.index] : null;}
};
