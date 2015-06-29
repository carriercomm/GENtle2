import template from '../templates/sequence_edition_view.hbs';
// import SequenceCanvas from '../lib/sequence_canvas';
import ChromatographCanvas from '../lib/chromatograph_canvas';
import Gentle from 'gentle';
import ContextMenuView from '../../common/views/context_menu_view';
import ChromatographMapView from '../../chromatograph_map/views/chromatograph_map_view';
import LinearMapView from '../../linear_map/views/linear_map_view';
import PlasmidMapView from '../../plasmid_map/views/plasmid_map_view';
// import MatchedEnzymesView from './matched_enzymes_view';
import Backbone from 'backbone';
import Q from 'q';

/**
@module Sequence
@submodule Views
@class SequenceEditionView
**/
export default Backbone.View.extend({
  manage: true,
  template: template,
  className: 'sequence-view',

  initialize: function() {
    var _this = this;

    this.model = Gentle.currentSequence;

    this.contextMenuView = new ContextMenuView({context: 'sequence'});

    // this.matchedEnzymesView = new MatchedEnzymesView();
    // this.setView('.sequence-matched-enzymes-outlet', this.matchedEnzymesView);

    this.initSecondaryViews();

    this.listenTo(this.model, 'change:chromatogramFragments', function(sequence, fragments){
      console.log(arguments)
      var fragment = fragments[fragments.length-1];
      _this.addChromatograph(fragment)
    })
  },

  initSecondaryViews: function(trigger) {
    var secondaryViews,
        currentView;

    secondaryViews = _.chain(Gentle.plugins)
      .where({type: 'sequence-secondary-view'})
      .pluck('data')
      .value();

    secondaryViews.push({
      name: 'chromatograph',
      title: 'Chromatograph Map',
      view:   ChromatographMapView
    });

    // secondaryViews.push({
    //   name: 'linear',
    //   title: 'Linear map',
    //   view: LinearMapView
    // });

    // secondaryViews.push({
    //   name: 'plasmid',
    //   title: 'Plasmid map',
    //   view: PlasmidMapView
    // });

    // currentView = this.model.get('isCircular') ? 'plasmid' : 'linear';
    currentView = 'chromatograph';

    // if(!~_.pluck(secondaryViews, 'name').indexOf(currentView))
    //   currentView = 'linear';

    this.secondaryViews = secondaryViews;
    this.changeSecondaryView(currentView, false);
  },

  handleResizeRight: function(trigger) {
    $('#sequence-canvas-primary-view-outlet, .sequence-canvas-outlet').css({
      // 'right': this.secondaryView.$el.width(),
      top: this.secondaryView.$el.height()
    });
    if(trigger !== false) {
      this.trigger('resize');
      this.secondaryView.trigger('resize');
    }
  },

  secondaryViewRightPos: function() {
    return $('#sequence-secondary-view-outlet').width();
  },

   primaryViewLeftPos: function() {
    return $('#sequence-primary-view-outlet').width();
  },

  changeSecondaryView: function(viewName, render) {
    var secondaryViewClass = _.findWhere(this.secondaryViews, {name: viewName});
    if(this.secondaryView) this.secondaryView.remove();
    this.secondaryView = new secondaryViewClass.view({
      horizontal: true
    });

    this.model.set('displaySettings.secondaryView', viewName).throttledSave();

    this.setView('#sequence-canvas-secondary-view-outlet', this.secondaryView);
    var secondaryViewPromise;
    if(render !== false) {
      secondaryViewPromise = this.secondaryView.render();
    } else {
      secondaryViewPromise = Q.resolve();
    }
    // `handleResizeRight` requires secondaryView to be rendered so that
    // it (`this.secondaryView.$el.width()`) is the correct value.
    secondaryViewPromise.then(() => {
      this.handleResizeRight(false);
      if(render !== false) {
       this.sequenceCanvas.refresh();
      }
    });
  },

  addChromatograph: function(fragment){


    var newLines = {
      chromatogram: ['Chromatogram', {
          height: 80,
          baseLine: 15,
          sequence: fragment
        }],
        chromatogram_dna: ['DNA_XY', {
          height: 15,
          baseLine: 15,
          sequence: fragment
          // textFont: LineStyles.dna.text.font,
          // textColour: _.partial(dnaStickyEndTextColour, false, LineStyles.dna.text.color),
          // selectionColour: LineStyles.dna.selection.fill,
          // selectionTextColour: LineStyles.dna.selection.color
        }],
      }


    this.sequenceCanvas.addLines(newLines)
    this.sequenceCanvas.display2d()
  },

  afterRender: function() {
    this.$('.sequence-canvas-outlet').css({
      top: this.secondaryView.$el.height()
      // 'right': this.secondaryView.$el.width(),
    });

    var sequence = this.model;

    var sequenceCanvas = this.sequenceCanvas = new ChromatographCanvas({
      sequence: sequence,
      container: this.$('.sequence-canvas-outlet').first(),
      yOffset: sequence.get('displaySettings.yOffset'),
      // non library options
      contextMenu: this.contextMenuView,
      view: this
    });

    sequenceCanvas.refresh();
  },

});