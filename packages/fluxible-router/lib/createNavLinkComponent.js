/**
 * Copyright 2015, Yahoo! Inc.
 * Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
/*global window */
'use strict';
var React = require('react');
var RouteStore = require('./RouteStore');
var debug = require('debug')('NavLink');
var navigateAction = require('./navigateAction');

function objectWithoutProperties(obj, keys) {
    var target = {};
    for (var i in obj) {
        if (keys.indexOf(i) >= 0) {
            continue;
        }
        if (!Object.prototype.hasOwnProperty.call(obj, i)) {
            continue;
        }
        target[i] = obj[i];
    }
    return target;
}

function isLeftClickEvent (e) {
    return e.button === 0;
}

function isModifiedEvent (e) {
    return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey);
}

function shouldListen(props) {
    return props.activeClass || props.activeStyle || props.activeElement;
}

/**
 * Client only.
 * @method getRelativeHref
 * @param {String} href The url string, could be absolute url
 * @return {String|Null} The relative url string; Null if the href is an external url.
 * @private
 */
function getRelativeHref(href) {
    if (typeof window === 'undefined') {
        throw new Error('getRelativeHref() only supported on client side');
    }

    if (href[0] === '/' || href[0] === '#') {
        return href;
    }

    var location = window.location;
    var origin = location.origin || (location.protocol + '//' + location.host);
    if (href.indexOf(origin) !== 0) {
        return null;
    }

    return href.substring(origin.length) || '/';
}

/**
 * create NavLink component with custom options
 * @param {Object} overwriteSpec spec to overwrite the default spec to create NavLink
 * @returns {React.Component} NavLink component
 */
module.exports = function createNavLinkComponent (overwriteSpec) {
    var NavLink = React.createClass(Object.assign({}, {
        autobind: false,
        displayName: 'NavLink',
        contextTypes: {
            executeAction: React.PropTypes.func.isRequired,
            getStore: React.PropTypes.func.isRequired
        },
        propTypes: {
            href: React.PropTypes.string,
            stopPropagation: React.PropTypes.bool,
            routeName: React.PropTypes.string,
            navParams: React.PropTypes.object,
            queryParams: React.PropTypes.object,
            followLink: React.PropTypes.bool,
            preserveScrollPosition: React.PropTypes.bool,
            replaceState: React.PropTypes.bool,
            validate: React.PropTypes.bool,
            activeClass: React.PropTypes.string,
            activeElement: React.PropTypes.string,
            activeStyle: React.PropTypes.object
        },
        getInitialState: function () {
            return this._getState(this.props);
        },
        startListening: function () {
            var routeStore = this.context.getStore(RouteStore);
            this._onRouteStoreChange = this.constructor.prototype._onRouteStoreChange.bind(this);
            routeStore.addChangeListener(this._onRouteStoreChange);
        },
        stopListening: function () {
            var routeStore = this.context.getStore(RouteStore);
            routeStore.removeChangeListener(this._onRouteStoreChange);
        },
        componentDidMount: function () {
            if (this.props.activeClass || this.props.activeStyle) {
                this.startListening();
            }
        },
        componentWillUnmount: function () {
            if (this.props.activeClass || this.props.activeStyle) {
                this.stopListening();
            }
        },
        componentDidUpdate: function (prevProps, prevState) {
            var prevListening = shouldListen(prevProps);
            var shouldBeListening = shouldListen(this.props);
            if (prevListening && !shouldBeListening) {
                this.stopListening();
            }
            if (!prevListening && shouldBeListening) {
                this.startListening();
                // Force an update to sync with store
                this._onRouteStoreChange();
            }
        },
        shouldComponentUpdate: function (nextProps, nextState) {
            return (
                nextProps !== this.props ||
                this.state.currentRoute !== nextState.currentRoute
            );
        },
        componentWillReceiveProps: function (nextProps) {
            this.setState(this._getState(nextProps));
        },
        _onRouteStoreChange: function () {
            if (this.isMounted()) {
                this.setState(this._getState(this.props));
            }
        },
        _getState: function (props) {
            var routeStore = this.context.getStore(RouteStore);
            var href = this._getHrefFromProps(props);
            return {
                href: href,
                currentRoute: routeStore.getCurrentRoute()
            };
        },
        _getHrefFromProps: function (props) {
            var href = props.href;
            var routeName = props.routeName;
            var routeStore = this.context.getStore(RouteStore);
            var navParams = this.getNavParams(props);
            var queryParams = this.getQueryParams(props);
            if (!href && routeName) {
                href = routeStore.makePath(routeName, navParams, queryParams);
            }
            if (!href) {
                throw new Error('NavLink created without href or unresolvable ' +
                    'routeName \'' + routeName + '\' with params ' +
                    JSON.stringify(navParams));
            }
            return href;
        },
        /**
         * Default getDefaultChildProps function, return empty object
         * @method getDefaultChildProps
         * @return {Object} default child props
         */
        getDefaultChildProps: function () {
            return {};
        },
        /**
         * Allows consumer to add additional properties to filter from the node
         * @see https://fb.me/react-unknown-prop
         * @method getFilteredProps
         * @returns {Array} filteredProps
         */
        getFilteredProps: function () {
            return [];
        },
        /**
         * Default getNavParams function, return props.navParams
         * @method getNavParams
         * @param {Object} props props object
         * @return {Object} nav params
         */
        getNavParams: function (props) {
            return props.navParams;
        },
        /**
         * Default getQueryParams function, return props.queryParams
         * @method getQueryParams
         * @param {Object} props props object
         * @return {Object} query params
         */
        getQueryParams: function (props) {
            return props.queryParams;
        },
        /**
         * Default shouldFollowLink, return props.followLink
         * @method shouldFollowLink
         * @param {Object} props props object
         * @return {Boolean} should follow link value
         */
        shouldFollowLink: function(props) {
            props = props || this.props;
            return props.followLink;
        },
        /**
         * Client side only. Evaluate navigation related states.
         * @method _getClientState
         * @return {Object} The state object
         * @private
         */
        _getClientState: function () {
            if (this._clientState && this._clientState.href === this.state.href) {
                // use cached state object
                return this._clientState;
            }

            var href = this.state.href;
            var relativeHref = getRelativeHref(href);

            this._clientState = {
                href: href,
                relativeHref: relativeHref,
                isHashHref: relativeHref && relativeHref[0] === '#',
                isValidRoute: !!(relativeHref &&
                    this.context.getStore(RouteStore).getRoute(relativeHref))
            };
            return this._clientState;
        },
        /**
         * Client side only. Check whether the link represented by this NavLink component
         * is client side route-able.
         * @method isRoutable
         * @return {Boolean} false if the link is a hash fragment of current url;
         *      false if the link is an external link with different origin;
         *      false if the NavLink component is configured to validate route
         *      before client side nav and no matching route found;
         *      true otherwise.
         */
        isRoutable: function () {
            var clientState = this._getClientState();
            if (clientState.isHashHref || !clientState.relativeHref) {
                return false;
            }
            if (this.props.validate && !clientState.isValidRoute) {
                return false;
            }
            return true;
        },
        dispatchNavAction: function (e) {
            debug('dispatchNavAction: action=NAVIGATE', this.props.href);
            if (this.props.stopPropagation) {
                e.stopPropagation();
            }

            if (isModifiedEvent(e) || !isLeftClickEvent(e)) {
                // let browser handle it natively
                return;
            }

            if (this.shouldFollowLink() || !this.isRoutable()) {
                // do not prevent default, let browser handle natively
                return;
            }

            e.preventDefault();

            var onBeforeUnloadText = typeof window.onbeforeunload === 'function' ? window.onbeforeunload() : '';
            var confirmResult = onBeforeUnloadText ? window.confirm(onBeforeUnloadText) : true;

            if (confirmResult) {
                // Removes the window.onbeforeunload method so that the next page will not be affected
                window.onbeforeunload = null;

                var clientState = this._getClientState();
                var navParams = this.getNavParams(this.props);
                var navType = this.props.replaceState ? 'replacestate' : 'click';
                var context = this.props.context || this.context;

                debug('dispatchNavAction: execute navigateAction', this.props.href, navType, navParams);

                context.executeAction(navigateAction, {
                    type: navType,
                    url: clientState.relativeHref,
                    preserveScrollPosition: this.props.preserveScrollPosition,
                    params: navParams
                });
            }
        },
        clickHandler: function (e) {
            this.dispatchNavAction(e);
        },
        render: function () {
            var href = this._getHrefFromProps(this.props);
            var activeClass = this.props.activeClass;
            var activeStyle = this.props.activeStyle;
            var activeElement = this.props.activeElement;

            var childProps = objectWithoutProperties(this.props, [
                'activeClass',
                'activeElement',
                'activeStyle',
                'currentRoute',
                'followLink',
                'navParams',
                'preserveScrollPosition',
                'queryParams',
                'replaceState',
                'routeName',
                'stopPropagation',
                'validate'
            ].concat(this.getFilteredProps()));

            var isActive = false;
            if (activeClass || activeStyle || activeElement) {
                var routeStore = this.context.getStore(RouteStore);
                isActive = routeStore.isActive(href);
            }

            var style = this.props.style;
            var className = this.props.className;
            if (isActive) {
                if (activeClass) {
                    className = className ? (className + ' ') : '';
                    className += activeClass;
                }
                if (activeStyle) {
                    style = Object.assign({}, this.props.style, activeStyle);
                }
            }

            var defaultProps = this.getDefaultChildProps();

            if (!(isActive && activeElement) && !this.props.onClick) {
                childProps.onClick = this.clickHandler.bind(this);
            }

            childProps = Object.assign(defaultProps, childProps, {
                className: className,
                style: style
            });

            if (!(isActive && activeElement)) {
                childProps.href = href;
            }

            var childElement = isActive ? activeElement || 'a' : 'a';

            return React.createElement(
                childElement,
                childProps,
                this.props.children
            );
        }
    }, overwriteSpec));
    return NavLink;
};
