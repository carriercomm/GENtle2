import Q from 'q';
import $ from 'jquery';
import _ from 'underscore';

import template from './sequence_canvas_template.html';

import Artist from '../../common/lib/graphics/artist';
import Hotkeys from '../../common/lib/hotkeys';
import CopyPasteHandler from '../../common/lib/copy_paste_handler';

import Lines from './lines'
import Caret from '../../common/lib/caret';
import _Handlers from './_sequence_canvas_handlers';
import _Utilities from './_sequence_canvas_utilities';
import _ContextMenu from './_sequence_canvas_context_menu';

import {namedHandleError} from '../../common/lib/handle_error';
import {assertIsDefinedAndNotNull, assertIsObject} from '../../common/lib/testing_utils';
import {safeMixin} from '../utils/mixin.js';


/**
Handles displaying a sequence in a canvas.

Is instantiated inside a parent Backbone.View, and is automatically
rendered.

@class SequenceCanvas
@constructor
@uses SequenceCanvasContextMenu
@uses SequenceCanvasHandlers
@uses SequenceCanvasUtilities
@module SequenceCanvas
**/
class SequenceCanvas {
  constructor(options = {}) {
    // Context binding (context is lost in Promises' `.then` and `.done`)
    _.bindAll(this, 'calculateLayoutSettings',
      'redrawSelection',
      'display',
      'refresh',
      'refreshFromResize',
      'redraw',
      'afterNextRedraw',
      'handleScrolling',
      'handleMousedown',
      'handleMousemove',
      'handleMouseup',
      'handleClick',
      'handleKeypress',
      'handleKeydown',
      'handleBlur'
    );

    this.id = _.uniqueId();

    /**
      Sequence to be displayed
      @property sequence
      @type Sequence (Backbone.Model)
      @default `this.view.model`
    **/
    var sequence = this.sequence = options.sequence;
    assertIsDefinedAndNotNull(sequence);

    this.readonly = !!options.readonly;

    /**
        DOM container element as a jQuery object
        @property container
        @type jQuery object
    **/
    var $container = this.$container = this._initContainer(options.container);

    /**
        Invisible DIV used to handle scrolling.
        As high as the total virtual height of the sequence as displayed.
        @property $scrollingChild
        @type jQuery object
    **/
    this.$scrollingChild = $container.$('.scrolling-child');

    /**
        Div in which `this.$scrollingChild` will scroll.
        Same height as `this.$canvas`
        @property $scrollingParent
        @type jQuery object
    **/
    this.$scrollingParent = $container.$('.scrolling-parent');


    /** Memoized functions */
    this.getXPosFromBase = _.memoize2(this.getXPosFromBase);

    /**
     * Object containing all lines
     * @type {Object<Lines>}
     * @property lines
     */
    this.lines = this._initLines(options.lines || {});

    /**
        @property layoutSettings
        @type Object
        @default false
    **/
    this.layoutSettings = _.default(options.layoutSettings || {}, {
      canvasDims: {
        width: 1138,
        height: 448
      },
      pageMargins: {
        left: 20,
        top: 20,
        right: 20,
        bottom: 20
      },
      scrollPercentage: 1.0,
      gutterWidth: 30,
      basesPerBlock: 10,
      basePairDims: {
        width: 10,
        height: 15
      }
    });

    /**
     * @property {Object} layoutHelpers Calculated layout properties
     */
    this.layoutSettings = {};

    this.artist = new Artist(this.$canvas);
    this.caret = new Caret({
      $container: this.$scrollingChild,
      className: 'sequence-canvas-caret',
      blinking: true
    });
    this.allowedInputChars = ['A', 'T', 'C', 'G'];
    this.displayDeferred = Q.defer();
    this.copyPasteHandler = new CopyPasteHandler();

    this.contextMenu = this.view.getView('#sequence-canvas-context-menu-outlet');

    this.invertHotkeys = _.invert(Hotkeys);
    this.commandKeys = _.reduce(['A', 'C', 'Z', 'V'], (memo, key) => {
      memo[key] = key.charCodeAt(0);
      return memo;
    }, {});

    // Events
    // this.view.on('resize', this.refreshFromResize);
    // this.sequence.on('change:sequence change:displaySettings.* change:features.* change:features', this.refresh);
    this.$scrollingParent.on('scroll', this.handleScrolling);
    this.$scrollingParent.on('mousedown', this.handleMousedown);
    this.$scrollingParent.on('keypress', this.handleKeypress);
    this.$scrollingParent.on('keydown', this.handleKeydown);
    this.$scrollingParent.on('blur', this.handleBlur);

    this.mixinJqueryEvents();

    // Kickstart rendering
    this.refresh();
  }

  /**
   * Converts `$container` into a jQuery object if necessary and insert relevant
   * scrolling helper elements in it.
   * @param  {Element, Node or $ object} $container DOM element in which to 
   *                        insert the necessary elements
   * @return {$ object} container as instance of $
   */
  _initContainer($container) {
    assertIsDefinedAndNotNull($container, 'options.container');
    $container = $container instanceof $ ? $container : $($container);

    $container
      .addClass('sequence-canvas-wrapper')
      .html(template({id: this.id}));

    return $container;
  } 

  _initLines(lines) {
    assertIsObject(lines);
    return _.mapObject(lines, (value) => {
      return Lines[value[0]](this, value[1] || {});
    });
  }

  _mixinJqueryEvents() {
    var jQueryPassthrough = function(methodName) {
      return (...args) => $(this)[methodName].apply(this, args);
    };

    _.each(['on', 'off', 'one', 'trigger'], (methodName) => {
      this[methodName] = jQueryPassthrough(methodName);
    });

    this.once = this.one;
  }

  /**
      Updates Canvas Dimemnsions based on viewport.
      @method updateCanvasDims
      @returns {Promise} a Promise finished when this and `this.calculateLayoutSettings` are finished
  **/
  updateCanvasDims() {
    return Q.promise(function(resolve) {
      // Updates width of $canvas to take scrollbar of $scrollingParent into account
      this.$canvas.width(this.$scrollingChild.width());

      var width = this.$canvas[0].scrollWidth,
        height = this.$canvas[0].scrollHeight;

      this.layoutSettings.canvasDims.width = width;
      this.layoutSettings.canvasDims.height = height;

      this.artist.setDimensions(width, height);

      resolve();
    });
  }

  /**
      Calculate "helper" layout settings based on already set layout settings
      @method calculateLayoutSettings
      @returns {Promise} a Promise fulfilled when finished
  **/
  calculateLayoutSettings() {
    //line offsets
    var line_offset = _.values(this.layoutSettings.lines)[0].height;
    var ls = this.layoutSettings;
    var lh = this.layoutHelpers;

    return Q.promise(function(resolve) {

      //basesPerRow
      var blocks_per_row = Math.floor((ls.canvasDims.width + ls.gutterWidth - (ls.pageMargins.left + ls.pageMargins.right)) / (ls.basesPerBlock * ls.basePairDims.width + ls.gutterWidth));
      if (blocks_per_row !== 0) {
        lh.basesPerRow = ls.basesPerBlock * blocks_per_row;
      } else {
        lh.basesPerRow = Math.floor((ls.canvasDims.width + ls.gutterWidth - (ls.pageMargins.left + ls.pageMargins.right)) / ls.basePairDims.width);
        //we want bases per row to be a multiple of 10 (DOESNT WORK)
        if (lh.basesPerRow > 5) {
          lh.basesPerRow = 5;
        } else if (lh.basesPerRow > 2) {
          lh.basesPerRow = 2;
        } else {
          lh.basesPerRow = 1;
        }
      }

      lh.lineOffsets = {};
      _.each(ls.lines, function(line, lineName) {
        line.clearCache();
        if ((line.visible === undefined || line.visible()) && !line.floating) {
          lh.lineOffsets[lineName] = line_offset;
          if (_.isFunction(line.calculateHeight)) line.calculateHeight();
          line_offset += line.height;
        }
      });

      //row height
      lh.rows = {
        height: line_offset
      };

      //total number of rows in sequence,
      lh.rows.total = Math.ceil(this.sequence.length() / lh.basesPerRow);
      // number of visible rows in canvas
      lh.rows.visible = Math.ceil(ls.canvasDims.height / lh.rows.height);

      //page dims
      lh.pageDims = {
        width: ls.canvasDims.width,
        height: ls.pageMargins.top + ls.pageMargins.bottom + lh.rows.total * lh.rows.height
      };

      // canvas y scrolling offset
      lh.yOffset = lh.yOffset || this.sequence.get('displaySettings.yOffset') || 0;


      // if (this.layoutHelpers.BasePosition === undefined)
      //   this.layoutHelpers.BasePosition = this.getBaseFromXYPos(0, lh.yOffset + lh.rows.height);

      // if (this.layoutHelpers.BaseRow === undefined)
      //   this.layoutHelpers.BaseRow = lh.basesPerRow;

      // if (this.layoutHelpers.BaseRow > lh.basesPerRow) {
      //   this.layoutHelpers.yOffsetPrevious = lh.yOffset;
      //   lh.yOffset = this.getYPosFromBase(this.layoutHelpers.BasePosition);
      // } else {
      //   if (this.layoutHelpers.yOffsetPrevious !== undefined)
      //     lh.yOffset = this.layoutHelpers.yOffsetPrevious;
      // }

      if(lh.firstBase) {
        lh.yOffset = this.getYPosFromBase(lh.firstBase);
        lh.firstBase = undefined;
      }

      this.$scrollingParent.scrollTop(lh.yOffset);

      this.clearCache();

      this.trigger('change change:layoutHelpers', lh);

      // We resize `this.$scrollingChild` and fullfills the Promise
      this.resizeScrollHelpers().then(resolve);
    });
  }

  /**
      If `this.visible`, displays the sequence in the initiated canvas.
      @method display
  **/
  display() {
    if (this.visible) {
      var artist = this.artist,
        ls = this.layoutSettings,
        lh = this.layoutHelpers,
        yOffset = lh.yOffset,
        _this = this,
        canvasHeight = ls.canvasDims.height,
        drawStart, drawEnd, moveOffset;

      return Q.promise(function(resolve, reject) {

        // Check if we have a previousYOffset reference, in which case
        // we will only redraw the missing part
        moveOffset = lh.previousYOffset !== undefined ?
          -lh.previousYOffset + yOffset :
          0;

        if (moveOffset !== 0) {
          artist.scroll(-moveOffset);

          drawStart = moveOffset > 0 ? canvasHeight - moveOffset : 0;
          drawEnd = moveOffset > 0 ? canvasHeight : -moveOffset;

          lh.previousYOffset = undefined;

        } else {

          artist.clear();
          drawStart = 0;
          drawEnd = canvasHeight;

        }

        _this.forEachRowInPosYRange(drawStart, drawEnd, _this.drawRow);

        _this.displayDeferred.resolve();
        _this.displayDeferred = Q.defer();
        resolve();

      }).catch(namedHandleError('sequence_canvas, display'));
    } else {
      return Q.reject();
    }
  }

  drawHighlight(posY, baseRange) {
    var layoutHelpers = this.layoutHelpers;
    var startX = this.getXPosFromBase(baseRange[0]);
    var endX = this.getXPosFromBase(baseRange[1]);

    this.artist.rect(startX, posY, endX - startX, layoutHelpers.rows.height, {
      fillStyle: '#fcf8e3'
    });
  }

  /**
  Draw row at position posY in the canvas
  @method drawRow
  @param {integer} posY
  **/
  drawRow(posY) {
    var layoutSettings = this.layoutSettings,
      lines = layoutSettings.lines,
      layoutHelpers = this.layoutHelpers,
      yOffset = layoutHelpers.yOffset,
      rowsHeight = layoutHelpers.rows.height,
      canvasHeight = layoutSettings.canvasDims.height,
      bottomMargin = layoutSettings.pageMargins.bottom,
      baseRange = this.getBaseRangeFromYPos(posY + yOffset),
      highlight = this.highlight,
      initPosY = posY;

    this.artist.clear(posY, rowsHeight);

    if(highlight !== undefined && highlight[0] <= baseRange[1] && highlight[1] >= baseRange[0]) {
      this.drawHighlight(posY, [
        Math.max(baseRange[0], highlight[0]),
        Math.min(baseRange[1], highlight[1])
      ]);
    }

    if (baseRange[0] < this.sequence.length()) {
      _.each(lines, function(line, key) {
        if (line.visible === undefined || line.visible()) {
          if(line.floating) {
            line.draw(initPosY, baseRange);
          } else {
            line.draw(posY, baseRange);
            posY += line.height;
          }
        }
      });
    }
  }

  /**
  Resizes $scrollingChild after window/parent div has been resized
  @method resizeScrollHelpers
  @return {Promise}
  **/
  resizeScrollHelpers() {
    var layoutHelpers = this.layoutHelpers;
    return Q.promise((resolve) => {
      this.$scrollingChild.height(layoutHelpers.pageDims.height);
      this.scrollTo();
      resolve();
    });
  }

  /**
  Updates layout settings and redraws canvas
  @method refresh
  **/
  refresh() {
    if (this.caretPosition !== undefined) {
      this.hideCaret();
      this.caretPosition = undefined;
    }
    this.updateCanvasDims()
      .then(this.calculateLayoutSettings)
      .then(this.redraw)
      .catch((e) => console.error(e));
  }

  /**
  Updates layout settings and redraws canvas when resizing.
  Keeps the first base the same
  @method refreshFromResize
  **/
  refreshFromResize() {
    var layoutHelpers = this.layoutHelpers;

    layoutHelpers.firstBase = this.getBaseRangeFromYPos(
      this.layoutSettings.pageMargins.top +
      (layoutHelpers.yOffset || 0)
    )[0];
    this.refresh();
  }

  /**
  Redraws canvas on the next animation frame
  @method redraw
  **/
  redraw() {
    return requestAnimationFrame(this.display);
  }

  scrollTo(yOffset, triggerEvent) {
    var deferred = Q.defer(),
      layoutHelpers = this.layoutHelpers;

    layoutHelpers.previousYOffset = layoutHelpers.yOffset;

    if (yOffset !== undefined) {

      // this.layoutHelpers.BasePosition = this.getBaseFromXYPos(0, yOffset + this.layoutHelpers.rows.height);
      this.sequence.set('displaySettings.yOffset',
        layoutHelpers.yOffset = yOffset, {
          silent: true
        }
      );
      this.sequence.throttledSave();
    }

    this.$scrollingParent.scrollTop(layoutHelpers.yOffset);

    this.afterNextRedraw(deferred.resolve);

    this.redraw();

    if (triggerEvent !== false) {
      this.trigger('scroll', yOffset);
    }

    return deferred.promise;
  }

  /**
  Make base visible (if it is below the visible part of the canvas,
  will just scroll down one row)
  @method scrollBaseToVisibility
  **/
  scrollBaseToVisibility(base) {
    var distanceToVisibleCanvas = this.distanceToVisibleCanvas(base);

    if (distanceToVisibleCanvas !== 0) {
      return this.scrollTo(this.layoutHelpers.yOffset + distanceToVisibleCanvas);
    } else {
      return Q.resolve();
    }
  }

  scrollToBase(base) {
    if (!this.isBaseVisible(base)) {
      var yPos = this.getYPosFromBase(base),
        maxY = this.$scrollingChild.height() - this.$scrollingParent.height();
      return this.scrollTo(Math.min(yPos, maxY));
    } else {
      return Q.resolve();
    }
  }

  clearCache() {
    this.getXPosFromBase.cache = {};
    // this.getYPosFromBase.cache = {};
  }

  afterNextRedraw() {
    var _this = this,
      args = _.toArray(arguments),
      func = args.shift();

    this.displayDeferred.promise.then(function() {
      func.apply(_this, args);
    });
  }

  highlightBaseRange(fromBase, toBase) {
    if(fromBase === undefined) {
      this.highlight = undefined;
    } else {
      this.highlight = [fromBase, toBase];
    }

    this.refresh();
  }

  /**
  Displays the caret before a base
  @method displayCaret
  @param base [base]
  **/
  SequenceCanvas(base) {
    var layoutHelpers = this.layoutHelpers,
      lineOffsets = layoutHelpers.lineOffsets,
      _this = this,
      posX, posY;

    if (base === undefined && this.caretPosition !== undefined) {
      base = this.caretPosition;
    }

    if (base > this.sequence.length()) {
      base = this.sequence.length();
    }

    this.scrollBaseToVisibility(base).then(function() {

      posX = _this.getXPosFromBase(base);
      posY = _this.getYPosFromBase(base) + lineOffsets.dna;

      _this.caret.move(posX, posY, base);
      _this.caretPosition = base;
      _this.showContextMenuButton(posX, posY + 20);

    });

  }

  moveCaret(newPosition) {
    if (this.selection) {
      this.selection = undefined;
      this.redraw();
    }
    this.displayCaret(newPosition);
  }

  hideCaret(hideContextMenu) {
    this.caret.remove();
    if (hideContextMenu === true) {
      this.hideContextMenuButton();
    }
  }

  redrawSelection(selection) {
    var
      lines = this.layoutSettings.lines,
      yOffset = this.layoutHelpers.yOffset,
      rowsHeight = this.layoutHelpers.rows.height,
      posY;

    //Calculating posY for baseRange
    if (selection !== undefined) {

      if (this.layoutHelpers.selectionPreviousA == undefined) {
        this.layoutHelpers.selectionPreviousA = selection[0];
      }
      if (this.layoutHelpers.selectionPreviousB == undefined) {
        this.layoutHelpers.selectionPreviousB = selection[1];
      }

      if (this.layoutHelpers.selectionPreviousA !== selection[1] || this.layoutHelpers.selectionPreviousB !== selection[0]) {

        if (this.layoutHelpers.selectionPreviousA === selection[1] - 1 || this.layoutHelpers.selectionPreviousA === selection[1] + 1) {

          posY = this.getYPosFromBase(selection[1]);
          if (this.layoutHelpers.selectionPreviousA == this.layoutHelpers.selectionPreviousB) {
            this.layoutHelpers.selectionPreB = selection[0];
          }
          this.layoutHelpers.selectionPreviousA = selection[1];
        } else if (this.layoutHelpers.selectionPreviousB === selection[0] - 1 || this.layoutHelpers.selectionPreviousB === selection[0] + 1) {

          posY = this.getYPosFromBase(selection[0]);
          if (this.layoutHelpers.selectionPreviousA == this.layoutHelpers.selectionPreviousB) {
            this.layoutHelpers.selectionPreviousA = selection[1];
          }
          this.layoutHelpers.selectionPreviousB = selection[0];
        }
      }
    }

    if(posY !== undefined) {
      this.partialRedraw(posY);
    } else {
      this.redraw();
    }
  }

  /**
  Only redraws the current row
  @method partialRedraw
  **/
  partialRedraw(posY) {
    var _this = this;
    requestAnimationFrame(function() {
      _this.drawRow(posY);
    });
  }

  /**
  @method select
  **/
  select(start, end) {
    var positionCheck;
    this.hideCaret();
    if (start !== undefined) {
      if (start < end) {
        this.selection = [start, end];
        this.caretPosition = end + 1;
        // positionCheck = this.caretPosition;

        // if (positionCheck > this.layoutHelpers.caretPositionBefore) {
        //   this.caretPosition = this.layoutHelpers.caretPositionBefore;
        //   if (start != this.layoutHelpers.selectionPreviousB - 1 && start != this.layoutHelpers.selectionPreviousB + 1 && start != this.layoutHelpers.selectionPreviousB)
        //     this.layoutHelpers.selectionPreviousB = this.caretPosition;
        //   if (end != this.layoutHelpers.selectionPreviousA - 1 && end != this.layoutHelpers.selectionPreviousA + 1 && end != this.layoutHelpers.selectionPreviousA)
        //     this.layoutHelpers.selectionPreviousA = this.caretPosition;
        //   positionCheck = this.caretPosition;
        // } else {
        //   this.layoutHelpers.caretPositionBefore = this.caretPosition;
        // }
      } else {
        this.selection = [end, start];
        this.caretPosition = start + 1;
      }
    } else {
      this.selection = undefined;
      this.caretPosition = undefined;
    }
    this.redraw();
  }

  expandSelectionToNewCaret(newCaret) {
    var selection = this.selection,
      previousCaret = this.caretPosition;
    this.layoutHelpers.caretPositionBefore = previousCaret;

    if (selection[0] == selection[1] && (
      (previousCaret > selection[0] && newCaret == selection[0]) ||
      (previousCaret == selection[0] && newCaret == selection[0] + 1)
    )) {
      this.select(undefined);
    } else {
      if (newCaret > selection[0]) {
        if (previousCaret <= selection[0]) {
          this.select(newCaret, selection[1]);
        } else {
          this.select(selection[0], newCaret - 1);
        }
      } else {
        if (previousCaret <= selection[1] && newCaret < selection[1]) {
          this.select(newCaret, selection[1]);
        } else {
          this.select(newCaret, selection[0] - 1);
        }
      }
    }
    this.displayCaret(newCaret);
  }

  cleanPastedText(text) {
    var regexp = new RegExp('[^' + this.allowedInputChars.join('') + ']', 'g');
    return text.toUpperCase().replace(regexp, '');
  }

  focus() {
    this.$scrollingParent.focus();
  }


}

safeMixin(
  SequenceCanvas.prototype,
  _Handlers.prototype,
  _Utilities.prototype,
  _ContextMenu.prototype
);

export default SequenceCanvas;