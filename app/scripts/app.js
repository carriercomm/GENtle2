/**
Gentle app definition.

Modules are registered here, along with their positioning in the layout.

The app is stored in `window.gentle` for global access.

@class App
@extends EventEmitter, Gentle
**/

require([
    'views/layout',
    'domReady',
    'models/sequence',
    'views/sequence_view'
  ], function(Layout, domReady, Sequence, SequenceView) {

  Gentle.currentSequence = new Sequence({
    id: +(new Date()),
    name: 'blablabla',
    sequence: 'ATCGATCG'
  });

  domReady(function() {
    Gentle.layout = new Layout();
    Gentle.layout.setView('#content', new SequenceView());
    Gentle.layout.render();
  });
});