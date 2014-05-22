define(function(require) {
  var template        = require('hbars!common/templates/context_menu_view'),
      Backbone        = require('backbone.mixed'),
      ContextMenuView;

  ContextMenuView = Backbone.View.extend({
    manage: true,
    template: template,

    events: {
      'click .menu-item, .menu-icon': 'handleClick',
      'click .dropdown-toggle': 'toggleMenu'
    },

    initialize: function() {
      this.display = false;
      this.posX = 0;
      this.posY = 0;
      this.width = 240;
      this.menuItemHeight = 25;
      this.menuIconWidth = 34;
      this.reset();
      _.bindAll(this, 'hide');
      $('body').on('click', this.hide);
    },

    reset: function() {
      this.menuItems = [];
      this.menuIcons = [];
      return this;
    },

    add: function(label, icon, callback) {
      var $assumedParent = this.$assumedParent;

      if(callback === undefined) {
        callback = icon;
        icon = undefined;
      }

      if(icon) {
        this.menuIcons.push({
          label: label, 
          icon: icon, 
          callback: callback,
          id: this.menuItems.length + this.menuIcons.length
        });
      } else {
        this.menuItems.push({
          label: label,
          callback: callback,
          id: this.menuItems.length + this.menuIcons.length
        });
      }

      this.posX = Math.min(
        this.posX, 
        $assumedParent.width() + $assumedParent.position().left - 
          ((this.menuIcons.length + 1) * this.menuIconWidth + 20)
      );

      return this;
    },

    move: function(posX, posY) {
      var parentOffset = this.$assumedParent.position();

      this.posX = posX + parentOffset.left;
      this.posY = posY + parentOffset.top;

      return this;
    },

    show: function() {
      var itemNb = this.menuItems.length;
      if(itemNb > 0) {
        var $parent = this.$assumedParent,
            parentWidth = $parent.width(),
            parentHeight = $parent.height();

        this.display = true;
        this.pullRight = this.posX - $parent.position().left - this.width > 0;
        this.dropup = this.posY + this.menuItemHeight * itemNb + 40 >= parentHeight;

        this.render();
        $parent.focus();
      }
      return this;
    },

    hide: function() {
      this.display = false;
      this.reset();
      this.render();
      return this;
    },

    handleClick: function(event) {
      var id = $(event.currentTarget).data('id'),
          menuItem =  _.findWhere(this.menuItems, {id: id}) ||
                      _.findWhere(this.menuIcons, {id: id});

      event.preventDefault();

      menuItem.callback.call(this.boundTo);
    },

    toggleMenu: function(event) {
      event.stopPropagation();
      event.preventDefault();
      $(event.currentTarget).dropdown('toggle');
    },

    serialize: function() {
      return {
        display: this.display,
        menuItems: this.menuItems,
        menuIcons: this.menuIcons,
        posX: this.posX,
        posY: this.posY,
        pullRight: this.pullRight,
        dropup: this.dropup
      };
    },

    remove: function() {
      $('body').off('click', this.hide);
      Backbone.View.prototype.remove.apply(this, arguments);
    }


    

  });

  return ContextMenuView;
});