import Signals from '../signals.js';
import Utils from '../utils.js';


function compare(a, b) {
    if (a == 'other')
        return 1;

    if (b == 'other')
        return -1;

    if (a.isNumeric && b.isNumeric)
        return b.gt(a) ? 1 : -1;
    else
        return b.gt(a) ? -1 : 1;
}

var COMPARE_METHODS = {
    'default': compare,
    'opensuse': function(a, b) {  // XXX: still a bit of a hack
        if (a == 'tumbleweed')
            return -1;

        if (b == 'tumbleweed')
            return 1;

        return compare(a, b);
    }
};


var StepChoice = function(step, name, data) {
    this.name = name;
    this.label = data.label || name;
    this.element = null;
    this.parent = step;
    this.child = null;  /* a child Step instance */
    this.selected = false;

    this._data = data;
};

StepChoice.prototype.createChild = function() {
    var child = new Step(this.name, this._data);
    child.setParent(this.parent);
    child.createElement();

    this.child = child;

    return child;
};

StepChoice.prototype.createElement = function() {
    var element = document.createElement('li');
    element.innerHTML = this.label;
    element.setAttribute('data-name', this.name);
    element.classList.add('list-group-item');

    element.addEventListener('click',
        function() {
            this.select();
        }.bind(this));

    this.element = element;

    return element;
};

StepChoice.prototype.select = function() {
    if (!this.selected) {
        this.selected = true;
        this.element.classList.add('active');

        this.emit('select');
    }
};

StepChoice.prototype.deselect = function() {
    if (this.selected) {
        this.selected = false;
        this.element.classList.remove('active');

        this.emit('deselect');
    }
};

Signals.addSignalMethods(StepChoice.prototype);


var Step = function(name, data) {
    this._data = data;
    this._choices = {};
    this._childrenContainer = null;

    this.name = name;
    this.label = data.childrenLabel;
    this.level = 0;
    this.selection = null;
    this.element = null;
    this.parent = null;

    this.hasChoices = false;
    this.mapped = false;
    this.height = 0;

    /* let specify children as array */
    if (data.children && Array.isArray(data.children)) {
        var childrenData = {};

        data.children.forEach(
            function(name) {
                childrenData[name] = {};
            });

        data.children = childrenData;
    }
};

Step.prototype.getContext = function() {
    var context = new Utils.Context(this._data).copy();

    if (this.selection) {
        context.data[this.selection.name] = true;
        context.data[this.name] = this.selection.name;
    }

    if (this.parent) {
        var parentContext = this.parent.getContext();
        parentContext.update(context.data);

        return parentContext;
    }

    return context;
};

Step.prototype._createChoice = function(name, data) {
    var choice = new StepChoice(this, name, data);
    choice.createElement();
    choice.createChild();
    choice.connect('select', this._onChoiceSelect.bind(this));
    choice.connect('deselect', this._onChoiceDeselect.bind(this));      

    return choice;
};

Step.prototype._onChoiceSelect = function(choice) {
    if (this.selection) {
        this.selection.deselect();
    }

    this.selection = choice;

    if (choice.child) {
        choice.child.show();
    }
};

Step.prototype._onChoiceDeselect = function(choice) {
    if (choice.child) {
        choice.child.clearSelection();  /* propagade unselect to children */
        choice.child.hide();
    }

    if (this.selection === choice) {
        this.selection = null;
    }
};

Step.prototype.createElement = function() {
    var element = document.createElement('div');
    element.classList.add('step', 'hidden-sm');

    /* create choices */
    var data = this._data;

    if (data.children) {
        this.hasChoices = true;

        var contentsContainer = document.createElement('aside');
        contentsContainer.classList.add('step-contents');
        element.appendChild(contentsContainer);

        var header = document.createElement('strong');
        header.classList.add('list-group-header');
        header.textContent = data.childrenLabel || '';
        contentsContainer.appendChild(header);

        var choicesContainer = document.createElement('ul');
        choicesContainer.classList.add('list-group');
        contentsContainer.appendChild(choicesContainer);

        this._contentsContainer = contentsContainer;
        this._choicesContainer = choicesContainer;

        var childrenNames = Object.keys(data.children);

        /* sort names alphabetically, but versions in reverse */
        childrenNames = childrenNames.map(
            function(name) {
                return new Utils.Version(name);
            });

        var sortFunc = COMPARE_METHODS[data.sortFunc || 'default'];
        childrenNames.sort(sortFunc);

        if (childrenNames.length) {
            this._childrenContainer = document.createElement('div');
            this._childrenContainer.classList.add('step-children');
            element.appendChild(this._childrenContainer);
        }

        childrenNames.forEach(
            function(name) {
                var choice = this._createChoice(name, this._data.children[name]);
                var child = choice.child;

                this._choicesContainer.appendChild(choice.element);
                this._childrenContainer.appendChild(child.element);
                this._choices[choice.name] = choice;
            }.bind(this));
    }
    else {
        element.classList.add('step-last');
    }

    this.element = element;

    return element;
};

Step.prototype.showChoices = function() {
    if (this._contentsContainer) {
        this._contentsContainer.classList.remove('hidden-sm');

        this.mapped = true;
    }
};

Step.prototype.hideChoices = function() {
    if (this._contentsContainer) {
        this._contentsContainer.classList.add('hidden-sm-sm');

        this.mapped = false;
    }
};

Step.prototype.show = function() {
    this.mapped = true;

    if (this.hasChoices)
        this.showChoices();
    else
        this.emit('update', this);

    this.element.classList.remove('hidden-sm');

    this.emit('show');

    this.emit('mapped-changed');
};

Step.prototype.hide = function() {
    this.mapped = false;

    this.element.classList.add('hidden-sm');

    this.emit('hide');

    this.emit('mapped-changed');
};

Step.prototype.clearSelection = function() {
    if (this.selection) {
        this.selection.deselect();
    }
};

Step.prototype.getWidth = function() {
    return this._contentsContainer ? this._contentsContainer : this.element.offsetWidth;
};

Step.prototype.getHeight = function() {
    return this.element ? this.element.offsetHeight : 0;
};

Step.prototype.getOffsetLeft = function() {
    var element = this.element;
    var offset = 0;

    if (element.offsetParent) {
        do {
            offset += element.offsetLeft;
            element = element.offsetParent;

            if (element.classList.contains('steps-wrapper')) {
                break;
            }
        } while (element);
    }

    return offset;
};

Step.prototype.getPreferedWidth = function(chooser) {
    if (this.hasChoices && chooser.element.offsetWidth > 400)
        return this.element.offsetWidth;
    else
        return chooser.element.offsetWidth;
};

Step.prototype.getPreferedHeight = function(chooser) {
    return this.element.offsetHeight;
};

Step.prototype.allocate = function(width, height) {
    if (!this.hasChoices) {
        this.element.style.width = width + 'px';
    }
};

Step.prototype.setParent = function(step) {
    this.parent = step;
    this.level = step.level + 1;

    /* propagade event to parents */
    this.connect('mapped-changed',
        function(object) {
            if (this.parent)
                this.parent.emit('mapped-changed');
        }.bind(this));

    this.connect('update',
        function(object, step) {
            if (this.parent)
                this.parent.emit('update', step);
        }.bind(this));
};

Step.prototype.getChoice = function(name) {
    return this._choices[name];
};

/**
 * Return choices within the step element. Assume that the do not change.
 */
Step.prototype.getChoices = function() {
    var choices = [];

    Object.keys(this._choices).forEach(
        function(name) {
            choices.push(this._choices[name]);
        }.bind(this));

    return choices;
};

Signals.addSignalMethods(Step.prototype);


function StepChooser(element, data) {
    this.element = element;
    this.backButton = null;
    this.wrapper = null;
    this.step = null;

    this.backButton = this._createBackButton();
    this.wrapper = this._createWrapper();
    this.step = this._createSteps('os', data);  // FIXME: 'os'

    this.element.classList.add('steps-widget');
    this.element.appendChild(this.backButton);
    this.element.appendChild(this.wrapper);
    this.wrapper.appendChild(this.step.element);

    var defaultChoice = this.step.getChoices()[0];
    if (defaultChoice) {
        defaultChoice.select();
    }

    this.step.show();

    window.addEventListener('resize', this._onWindowResized.bind(this));
};

/**
 * Create back button, to go up a level.
 */
StepChooser.prototype._createBackButton = function() {
    var element = document.createElement('a');
    element.textContent = '';
    element.classList.add('button', 'steps-back-button', 'hidden-sm');

    element.addEventListener('click',
        function() {
            var choice = this.getSelection().pop();
            if (choice) {
                choice.deselect();
                choice.parent.show();
            }
        }.bind(this));

    return element;
};

/**
 * Create contents wrapper. It's required for scrolling and clipping
 * its children.
 */
StepChooser.prototype._createWrapper = function() {
    var element = document.createElement('div');
    element.classList.add('steps-wrapper');

    return element;
};

StepChooser.prototype._createSteps = function(name, data) {
    var step = new Step(name, data, this);
    step.createElement();

    step.connect('mapped-changed', this._onMappedChanged.bind(this));

    return step;
};

StepChooser.prototype.getSteps = function() {
    var step = this.step;
    var steps = [];

    while (step) {
        steps.push(step);
        step = step.selection ? step.selection.child : null;
    }

    return steps;
};

StepChooser.prototype.getSelection = function() {
    var selection = [];
    var step = this.step;

    while (step) {
        if (step.selection) {
            selection.push(step.selection);

            step = step.selection.child;
        }
        else {
            break;
        }
    }

    return selection;
};

StepChooser.prototype.scroll = function(offset) {
    this.wrapper.style.webkitTransform = 'translate(' + (-offset) + 'px, 0)';
    this.wrapper.style.mozTransform = 'translate(' + (-offset) + 'px, 0)';
    this.wrapper.style.transform = 'translate(' + (-offset) + 'px, 0)';
};

StepChooser.prototype._onResized = function() {
    var wrapperWidth = 0;
    var wrapperHeight = 0;

    /* allocate elements according to preffered size
       and calculate maxHeight */
    var steps = this.getSteps();
    steps.forEach(
        function(step) {
            step.allocate(step.getPreferedWidth(this), null);

            wrapperHeight = Math.max(wrapperHeight, step.getHeight());
        }.bind(this));

    var lastStep = steps[steps.length - 1];
    if (lastStep) {
        wrapperWidth = lastStep.getOffsetLeft() + lastStep.getWidth();
    }

    this.wrapper.style.width = wrapperWidth + 'px';
    this.wrapper.style.height = wrapperHeight + 'px';

    /* update step visibility */
    var availableWidth = this.element.offsetWidth;
    var visible = true;
    var offset = 0;

    steps.reverse().forEach(
        function(step) {
            var stepOffset = step.getOffsetLeft();

            if (visible && stepOffset + step.getWidth() > availableWidth) {
                offset = stepOffset;

                visible = false;
            }

            if (visible)
                step.showChoices();
            else
                step.hideChoices();
        });

    this.scroll(offset);

    if (!visible) {
        var labels = [];
        for (var i=1; i < steps.length - 1; i++) {
            if (steps[i].selection.name.toString() != 'other') {
                labels.unshift(steps[i].selection.label);
            }
            else {
                labels.unshift(steps[i-1].label);
            }
        }

        this.backButton.innerHTML = labels.join(' ');
        this.backButton.classList.remove('hidden-sm');
    }
    else {
        this.backButton.classList.add('hidden-sm');
    }
},

StepChooser.prototype._onWindowResized = function() {
    var elementWidth = this.element.offsetWidth;

    if (this._elementWidth !== elementWidth) {
        this._elementWidth

        var transitionDuration = this.wrapper.style.transitionDuration;
        this.wrapper.style.transitionDuration = 0;
        this._onResized();
        this.wrapper.style.transitionDuration = transitionDuration;
    }
};

StepChooser.prototype._onMappedChanged = function() {
    this._onResized();
};

Signals.addSignalMethods(StepChooser.prototype);


export default StepChooser;
