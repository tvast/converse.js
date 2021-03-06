// Converse.js (A browser based XMPP chat client)
// http://conversejs.org
//
// This is the utilities module.
//
// Copyright (c) 2012-2017, Jan-Carel Brand <jc@opkode.com>
// Licensed under the Mozilla Public License (MPLv2)
//
/*global define, escape, window, Uint8Array */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([
            "sizzle",
            "es6-promise",
            "lodash.noconflict",
            "backbone",
            "strophe",
            "uri",
            "templates/audio.html",
            "templates/file.html",
            "templates/image.html",
            "templates/video.html"
        ], factory);
    } else {
        // Used by the mockups
        const Strophe = {
            'Strophe': root.Strophe,
            '$build': root.$build,
            '$iq': root.$iq,
            '$msg': root.$msg,
            '$pres': root.$pres,
            'SHA1': root.SHA1,
            'MD5': root.MD5,
            'b64_hmac_sha1': root.b64_hmac_sha1,
            'b64_sha1': root.b64_sha1,
            'str_hmac_sha1': root.str_hmac_sha1,
            'str_sha1': root.str_sha1
        };
        root.converse_utils = factory(
            root.sizzle,
            root.Promise,
            root._,
            root.Backbone,
            Strophe
        );
    }
}(this, function (
        sizzle,
        Promise,
        _,
        Backbone,
        Strophe,
        URI,
        tpl_audio,
        tpl_file,
        tpl_image,
        tpl_video
    ) {
    "use strict";
    Strophe = Strophe.Strophe;

    const URL_REGEX = /\b(https?:\/\/|www\.|https?:\/\/www\.)[^\s<>]{2,200}\b\/?/g;

    const logger = _.assign({
        'debug': _.get(console, 'log') ? console.log.bind(console) : _.noop,
        'error': _.get(console, 'log') ? console.log.bind(console) : _.noop,
        'info': _.get(console, 'log') ? console.log.bind(console) : _.noop,
        'warn': _.get(console, 'log') ? console.log.bind(console) : _.noop
    }, console);

    var isImage = function (url) {
        return new Promise((resolve, reject) => {
            var img = new Image();
            var timer = window.setTimeout(function () {
                reject(new Error("Could not determine whether it's an image"));
                img = null;
            }, 3000);
            img.onerror = img.onabort = function () {
                clearTimeout(timer);
                reject(new Error("Could not determine whether it's an image"));
            };
            img.onload = function () {
                clearTimeout(timer);
                resolve(img);
            };
            img.src = url;
        });
    };

    function slideOutWrapup (el) {
        /* Wrapup function for slideOut. */
        el.removeAttribute('data-slider-marker');
        el.classList.remove('collapsed');
        el.style.overflow = "";
        el.style.height = "";
    }


    var u = {};

    u.getLongestSubstring = function (string, candidates) {
        function reducer (accumulator, current_value) {
            if (string.startsWith(current_value)) {
                if (current_value.length > accumulator.length) {
                    return current_value;
                } else {
                    return accumulator;
                }
            } else {
                return accumulator;
            }
        }
        return candidates.reduce(reducer, '');
    }

    u.getNextElement = function (el, selector='*') {
        let next_el = el.nextElementSibling;
        while (!_.isNull(next_el) && !sizzle.matchesSelector(next_el, selector)) {
            next_el = next_el.nextElementSibling;
        }
        return next_el;
    }

    u.getPreviousElement = function (el, selector='*') {
        let prev_el = el.previousSibling;
        while (!_.isNull(prev_el) && !sizzle.matchesSelector(prev_el, selector)) {
            prev_el = prev_el.previousSibling
        }
        return prev_el;
    }

    u.getFirstChildElement = function (el, selector='*') {
        let first_el = el.firstElementChild;
        while (!_.isNull(first_el) && !sizzle.matchesSelector(first_el, selector)) {
            first_el = first_el.nextSibling
        }
        return first_el;
    }

    u.getLastChildElement = function (el, selector='*') {
        let last_el = el.lastElementChild;
        while (!_.isNull(last_el) && !sizzle.matchesSelector(last_el, selector)) {
            last_el = last_el.previousSibling
        }
        return last_el;
    }

    u.calculateElementHeight = function (el) {
        /* Return the height of the passed in DOM element,
         * based on the heights of its children.
         */
        return _.reduce(
            el.children,
            (result, child) => result + child.offsetHeight, 0
        );
    }

    u.addClass = function (className, el) {
        if (el instanceof Element) {
            el.classList.add(className);
        }
    }

    u.removeClass = function (className, el) {
        if (el instanceof Element) {
            el.classList.remove(className);
        }
        return el;
    }

    u.removeElement = function (el) {
        if (!_.isNil(el) && !_.isNil(el.parentNode)) {
            el.parentNode.removeChild(el);
        }
    }

    u.showElement = _.flow(
        _.partial(u.removeClass, 'collapsed'),
        _.partial(u.removeClass, 'hidden')
    )

    u.hideElement = function (el) {
        if (!_.isNil(el)) {
            el.classList.add('hidden');
        }
        return el;
    }

    u.ancestor = function (el, selector) {
        let parent = el;
        while (!_.isNil(parent) && !sizzle.matchesSelector(parent, selector)) {
            parent = parent.parentElement;
        }
        return parent;
    }

    u.nextUntil = function (el, selector, include_self=false) {
        /* Return the element's siblings until one matches the selector. */
        const matches = [];
        let sibling_el = el.nextElementSibling;
        while (!_.isNil(sibling_el) && !sibling_el.matches(selector)) {
            matches.push(sibling_el);
            sibling_el = sibling_el.nextElementSibling;
        }
        return matches;
    }

    u.unescapeHTML = function (string) {
        /* Helper method that replace HTML-escaped symbols with equivalent characters
         * (e.g. transform occurrences of '&amp;' to '&')
         *
         * Parameters:
         *  (String) string: a String containing the HTML-escaped symbols.
         */
        var div = document.createElement('div');
        div.innerHTML = string;
        return div.innerText;
    };

    u.escapeHTML = function (string) {
        return string
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    };

    u.escapeURL = function (url) {
        return encodeURI(decodeURI(url)).replace(/[!'()]/g, escape).replace(/\*/g, "%2A");
    };

    u.prefixMentions = function (message) {
        /* Given a message object, return its text with @ chars
         * inserted before the mentioned nicknames.
         */
        let text = message.get('message');
        (message.get('references') || [])
            .sort((a, b) => b.begin - a.begin)
            .forEach(ref => {
                text = `${text.slice(0, ref.begin)}@${text.slice(ref.begin)}`
            });
        return text;
    };

    u.addMentionsMarkup = function (text, references, chatbox) {
        if (chatbox.get('message_type') !== 'groupchat') {
            return text;
        }
        const nick = chatbox.get('nick');
        references
            .sort((a, b) => b.begin - a.begin)
            .forEach(ref => {
                const mention = text.slice(ref.begin, ref.end)
                chatbox;
                if (mention === nick) {
                    text = text.slice(0, ref.begin) + `<span class="mention mention--self badge badge-info">${mention}</span>` + text.slice(ref.end);
                } else {
                    text = text.slice(0, ref.begin) + `<span class="mention">${mention}</span>` + text.slice(ref.end);
                }
            });
        return text;
    };

    u.addHyperlinks = function (text) {
        return URI.withinString(text, function (url) {
            var uri = new URI(url);
            uri.normalize();
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'http://' + url;
            }
            url = u.escapeHTML(u.escapeURL(url));
            return `<a target="_blank" rel="noopener" href="${url}">${u.escapeHTML(uri.readable())}</a>`;
        });
    };

    u.renderNewLines = function (text) {
        return text.replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br/>');
    };

    u.renderImageURLs = function (_converse, obj) {
        /* Returns a Promise which resolves once all images have been loaded.
         */
        const { __ } = _converse;
        const list = obj.textContent.match(URL_REGEX) || [];
        return Promise.all(
            _.map(list, (url) =>
                new Promise((resolve, reject) =>
                    isImage(url).then(function (img) {
                        const i = new Image();
                        i.src = img.src;
                        i.addEventListener('load', resolve);
                        // We also resolve for non-images, otherwise the
                        // Promise.all resolves prematurely.
                        i.addEventListener('error', resolve);

                        _.each(sizzle(`a[href="${url}"]`, obj), (a) => {
                            a.outerHTML= tpl_image({
                                'url': url,
                                'label_download': __('Download')
                            })
                        });
                    }).catch(resolve)
                )
            )
        )
    };

    u.renderFileURL = function (_converse, url) {
        const uri = new URI(url),
              { __ } = _converse,
              filename = uri.filename();
        if (!_.includes(["https", "http"], uri.protocol()) ||
            filename.endsWith('mp3') || filename.endsWith('mp4') ||
            filename.endsWith('jpg') || filename.endsWith('jpeg') ||
            filename.endsWith('png') || filename.endsWith('gif') ||
            filename.endsWith('svg')) {

            return url;
        }
        return tpl_file({
            'url': url,
            'label_download': __('Download "%1$s"', filename)
        })
    };

    u.renderImageURL = function (_converse, url) {
        const { __ } = _converse;
        if (url.endsWith('jpg') || url.endsWith('jpeg') || url.endsWith('png') ||
            url.endsWith('gif') || url.endsWith('svg')) {

            return tpl_image({
                'url': url,
                'label_download': __('Download')
            })
        }
        return url;
    };

    u.renderMovieURL = function (_converse, url) {
        const { __ } = _converse;
        if (url.endsWith('mp4')) {
            return tpl_video({
                'url': url,
                'label_download': __('Download video file')
            })
        }
        return url;
    };

    u.renderAudioURL = function (_converse, url) {
        const { __ } = _converse;
        if (url.endsWith('mp3')) {
            return tpl_audio({
                'url': url,
                'label_download': __('Download audio file')
            })
        }
        return url;
    };

    u.slideInAllElements = function (elements, duration=300) {
        return Promise.all(
            _.map(
                elements,
                _.partial(u.slideIn, _, duration)
            ));
    };

    u.slideToggleElement = function (el, duration) {
        if (_.includes(el.classList, 'collapsed') ||
                _.includes(el.classList, 'hidden')) {
            return u.slideOut(el, duration);
        } else {
            return u.slideIn(el, duration);
        }
    };

    u.hasClass = function (className, el) {
        return _.includes(el.classList, className);
    };

    u.slideOut = function (el, duration=200) {
        /* Shows/expands an element by sliding it out of itself
         *
         * Parameters:
         *      (HTMLElement) el - The HTML string
         *      (Number) duration - The duration amount in milliseconds
         */
        return new Promise((resolve, reject) => {
            if (_.isNil(el)) {
                const err = "Undefined or null element passed into slideOut"
                logger.warn(err);
                reject(new Error(err));
                return;
            }
            const marker = el.getAttribute('data-slider-marker');
            if (marker) {
                el.removeAttribute('data-slider-marker');
                window.cancelAnimationFrame(marker);
            }
            const end_height = u.calculateElementHeight(el);
            if (window.converse_disable_effects) { // Effects are disabled (for tests)
                el.style.height = end_height + 'px';
                slideOutWrapup(el);
                resolve();
                return;
            }
            if (!u.hasClass('collapsed', el) && !u.hasClass('hidden', el)) {
                resolve();
                return;
            }

            const steps = duration/17; // We assume 17ms per animation which is ~60FPS
            let height = 0;

            function draw () {
                height += end_height/steps;
                if (height < end_height) {
                    el.style.height = height + 'px';
                    el.setAttribute(
                        'data-slider-marker',
                        window.requestAnimationFrame(draw)
                    );
                } else {
                    // We recalculate the height to work around an apparent
                    // browser bug where browsers don't know the correct
                    // offsetHeight beforehand.
                    el.removeAttribute('data-slider-marker');
                    el.style.height = u.calculateElementHeight(el) + 'px';
                    el.style.overflow = "";
                    el.style.height = "";
                    resolve();
                }
            }
            el.style.height = '0';
            el.style.overflow = 'hidden';
            el.classList.remove('hidden');
            el.classList.remove('collapsed');
            el.setAttribute(
                'data-slider-marker',
                window.requestAnimationFrame(draw)
            );
        });
    };

    u.slideIn = function (el, duration=200) {
        /* Hides/collapses an element by sliding it into itself. */
        return new Promise((resolve, reject) => {
            if (_.isNil(el)) {
                const err = "Undefined or null element passed into slideIn";
                logger.warn(err);
                return reject(new Error(err));
            } else if (_.includes(el.classList, 'collapsed')) {
                return resolve(el);
            } else if (window.converse_disable_effects) { // Effects are disabled (for tests)
                el.classList.add('collapsed');
                el.style.height = "";
                return resolve(el);
            }
            const marker = el.getAttribute('data-slider-marker');
            if (marker) {
                el.removeAttribute('data-slider-marker');
                window.cancelAnimationFrame(marker);
            }
            const original_height = el.offsetHeight,
                 steps = duration/17; // We assume 17ms per animation which is ~60FPS
            let height = original_height;

            el.style.overflow = 'hidden';

            function draw () { 
                height -= original_height/steps;
                if (height > 0) {
                    el.style.height = height + 'px';
                    el.setAttribute(
                        'data-slider-marker',
                        window.requestAnimationFrame(draw)
                    );
                } else {
                    el.removeAttribute('data-slider-marker');
                    el.classList.add('collapsed');
                    el.style.height = "";
                    resolve(el);
                }
            }
            el.setAttribute(
                'data-slider-marker',
                window.requestAnimationFrame(draw)
            );
        });
    };

    function afterAnimationEnds (el, callback) {
        el.classList.remove('visible');
        if (_.isFunction(callback)) {
            callback();
        }
    }

    u.fadeIn = function (el, callback) {
        if (_.isNil(el)) {
            logger.warn("Undefined or null element passed into fadeIn");
        }
        if (window.converse_disable_effects) {
            el.classList.remove('hidden');
            return afterAnimationEnds(el, callback);
        }
        if (_.includes(el.classList, 'hidden')) {
            el.classList.add('visible');
            el.classList.remove('hidden');
            el.addEventListener("webkitAnimationEnd", _.partial(afterAnimationEnds, el, callback));
            el.addEventListener("animationend", _.partial(afterAnimationEnds, el, callback));
            el.addEventListener("oanimationend", _.partial(afterAnimationEnds, el, callback));
        } else {
            afterAnimationEnds(el, callback);
        }
    };

    u.isValidJID = function (jid) {
        return _.compact(jid.split('@')).length === 2 && !jid.startsWith('@') && !jid.endsWith('@');
    };

    u.isValidMUCJID = function (jid) {
        return !jid.startsWith('@') && !jid.endsWith('@');
    };

    u.isSameBareJID = function (jid1, jid2) {
        return Strophe.getBareJidFromJid(jid1).toLowerCase() ===
                Strophe.getBareJidFromJid(jid2).toLowerCase();
    };

    u.getMostRecentMessage = function (model) {
        const messages = model.messages.filter('message');
        return messages[messages.length-1];
    }

    u.isNewMessage = function (message) {
        /* Given a stanza, determine whether it's a new
         * message, i.e. not a MAM archived one.
         */
        if (message instanceof Element) {
            return !(
                sizzle(`result[xmlns="${Strophe.NS.MAM}"]`, message).length &&
                sizzle(`delay[xmlns="${Strophe.NS.DELAY}"]`, message).length
            );
        } else {
            return !(message.get('is_delayed') && message.get('is_archived'));
        }
    };

    u.isOnlyChatStateNotification = function (attrs) {
        if (attrs instanceof Backbone.Model) {
            attrs = attrs.attributes;
        }
        return attrs['chat_state'] &&
            !attrs['oob_url'] &&
            !attrs['file'] &&
            !attrs['message'];
    };

    u.isHeadlineMessage = function (_converse, message) {
        var from_jid = message.getAttribute('from');
        if (message.getAttribute('type') === 'headline') {
            return true;
        }
        const chatbox = _converse.chatboxes.get(Strophe.getBareJidFromJid(from_jid));
        if (chatbox && chatbox.get('type') === 'chatroom') {
            return false;
        }
        if (message.getAttribute('type') !== 'error' &&
                !_.isNil(from_jid) &&
                !_.includes(from_jid, '@')) {
            // Some servers (I'm looking at you Prosody) don't set the message
            // type to "headline" when sending server messages. For now we
            // check if an @ signal is included, and if not, we assume it's
            // a headline message.
            return true;
        }
        return false;
    };

    u.merge = function merge (first, second) {
        /* Merge the second object into the first one.
         */
        for (var k in second) {
            if (_.isObject(first[k])) {
                merge(first[k], second[k]);
            } else {
                first[k] = second[k];
            }
        }
    };

    u.applyUserSettings = function applyUserSettings (context, settings, user_settings) {
        /* Configuration settings might be nested objects. We only want to
         * add settings which are whitelisted.
         */
        for (var k in settings) {
            if (_.isUndefined(user_settings[k])) {
                continue;
            }
            if (_.isObject(settings[k]) && !_.isArray(settings[k])) {
                applyUserSettings(context[k], settings[k], user_settings[k]);
            } else {
                context[k] = user_settings[k];
            }
        }
    };

    u.stringToNode = function (s) {
        /* Converts an HTML string into a DOM Node.
         * Expects that the HTML string has only one top-level element,
         * i.e. not multiple ones.
         *
         * Parameters:
         *      (String) s - The HTML string
         */
        var div = document.createElement('div');
        div.innerHTML = s;
        return div.firstElementChild;
    };

    u.getOuterWidth = function (el, include_margin=false) {
        var width = el.offsetWidth;
        if (!include_margin) {
            return width;
        }
        var style = window.getComputedStyle(el);
        width += parseInt(style.marginLeft, 10) + parseInt(style.marginRight, 10);
        return width;
    };

    u.stringToElement = function (s) {
        /* Converts an HTML string into a DOM element.
         * Expects that the HTML string has only one top-level element,
         * i.e. not multiple ones.
         *
         * Parameters:
         *      (String) s - The HTML string
         */
        var div = document.createElement('div');
        div.innerHTML = s;
        return div.firstElementChild;
    };

    u.matchesSelector = function (el, selector) {
        /* Checks whether the DOM element matches the given selector.
         *
         * Parameters:
         *      (DOMElement) el - The DOM element
         *      (String) selector - The selector
         */
        return (
            el.matches ||
            el.matchesSelector ||
            el.msMatchesSelector ||
            el.mozMatchesSelector ||
            el.webkitMatchesSelector ||
            el.oMatchesSelector
        ).call(el, selector);
    };

    u.queryChildren = function (el, selector) {
        /* Returns a list of children of the DOM element that match the
         * selector.
         *
         *  Parameters:
         *      (DOMElement) el - the DOM element
         *      (String) selector - the selector they should be matched
         *          against.
         */
        return _.filter(el.childNodes, _.partial(u.matchesSelector, _, selector));
    };

    u.contains = function (attr, query) {
        return function (item) {
            if (typeof attr === 'object') {
                var value = false;
                _.forEach(attr, function (a) {
                    value = value || _.includes(item.get(a).toLowerCase(), query.toLowerCase());
                });
                return value;
            } else if (typeof attr === 'string') {
                return _.includes(item.get(attr).toLowerCase(), query.toLowerCase());
            } else {
                throw new TypeError('contains: wrong attribute type. Must be string or array.');
            }
        };
    };

    u.isOfType = function (type, item) {
        return item.get('type') == type;
    };

    u.isInstance = function (type, item) {
        return item instanceof type;
    };

    u.getAttribute = function (key, item) {
        return item.get(key);
    };

    u.contains.not = function (attr, query) {
        return function (item) {
            return !(u.contains(attr, query)(item));
        };
    };

    u.rootContains = function (root, el) {
        // The document element does not have the contains method in IE.
        if (root === document && !root.contains) {
            return document.head.contains(el) || document.body.contains(el);
        }
        return root.contains ? root.contains(el) : window.HTMLElement.prototype.contains.call(root, el);
    };

    u.createFragmentFromText = function (markup) {
        /* Returns a DocumentFragment containing DOM nodes based on the
         * passed-in markup text.
         */
        // http://stackoverflow.com/questions/9334645/create-node-from-markup-string
        var frag = document.createDocumentFragment(),
            tmp = document.createElement('body'), child;
        tmp.innerHTML = markup;
        // Append elements in a loop to a DocumentFragment, so that the
        // browser does not re-render the document for each node.
        while (child = tmp.firstChild) {  // eslint-disable-line no-cond-assign
            frag.appendChild(child);
        }
        return frag
    };

    u.isPersistableModel = function (model) {
        return model.collection && model.collection.browserStorage;
    };

    u.getResolveablePromise = function () {
        /* Returns a promise object on which `resolve` or `reject` can be
         * called.
         */
        const wrapper = {};
        const promise = new Promise((resolve, reject) => {
            wrapper.resolve = resolve;
            wrapper.reject = reject;
        })
        _.assign(promise, wrapper);
        return promise;
    };

    u.interpolate = function (string, o) {
        return string.replace(/{{{([^{}]*)}}}/g,
            (a, b) => {
                var r = o[b];
                return typeof r === 'string' || typeof r === 'number' ? r : a;
            });
    };

    u.onMultipleEvents = function (events=[], callback) {
        /* Call the callback once all the events have been triggered
         *
         * Parameters:
         *  (Array) events: An array of objects, with keys `object` and
         *      `event`, representing the event name and the object it's
         *      triggered upon.
         *  (Function) callback: The function to call once all events have
         *      been triggered.
         */
        let triggered = [];

        function handler (result) {
            triggered.push(result)
            if (events.length === triggered.length) {
                callback(triggered);
                triggered = [];
            }
        }
        _.each(events, (map) => map.object.on(map.event, handler));
    };

    u.safeSave = function (model, attributes) {
        if (u.isPersistableModel(model)) {
            model.save(attributes);
        } else {
            model.set(attributes);
        }
    };

    u.siblingIndex = function (el) {
        /* eslint-disable no-cond-assign */
        for (var i = 0; el = el.previousElementSibling; i++);
        return i;
    };

    u.getCurrentWord = function (input) {
        const cursor = input.selectionEnd || undefined;
        return _.last(input.value.slice(0, cursor).split(' '));
    };

    u.replaceCurrentWord = function (input, new_value) {
        const cursor = input.selectionEnd || undefined,
              current_word = _.last(input.value.slice(0, cursor).split(' ')),
              value = input.value;
        input.value = value.slice(0, cursor - current_word.length) + `${new_value} ` + value.slice(cursor);
        input.selectionEnd = cursor - current_word.length + new_value.length + 1;
    };

    u.isVisible = function (el) {
        if (u.hasClass('hidden', el)) {
            return false;
        }
        // XXX: Taken from jQuery's "visible" implementation
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
    };

    u.triggerEvent = function (el, name, type="Event", bubbles=true, cancelable=true) {
        const evt = document.createEvent(type);
        evt.initEvent(name, bubbles, cancelable);
        el.dispatchEvent(evt);
    };

    u.geoUriToHttp = function(text, geouri_replacement) {
        const regex = /geo:([\-0-9.]+),([\-0-9.]+)(?:,([\-0-9.]+))?(?:\?(.*))?/g;
        return text.replace(regex, geouri_replacement);
    };

    u.httpToGeoUri = function(text, _converse) {
        const replacement = 'geo:$1,$2';
        return text.replace(_converse.geouri_regex, replacement);
    };

    u.getSelectValues = function (select) {
        const result = [];
        const options = select && select.options;
        for (var i=0, iLen=options.length; i<iLen; i++) {
            const opt = options[i];
            if (opt.selected) {
                result.push(opt.value || opt.text);
            }
        }
        return result;
    };

    u.formatFingerprint = function (fp) {
        fp = fp.replace(/^05/, '');
        const arr = [];
        for (let i=1; i<8; i++) {
            const idx = i*8+i-1;
            fp = fp.slice(0, idx) + ' ' + fp.slice(idx);
        }
        return fp;
    };

    u.appendArrayBuffer = function (buffer1, buffer2) {
        const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
        tmp.set(new Uint8Array(buffer1), 0);
        tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
        return tmp.buffer;
    };

    u.arrayBufferToHex = function (ab) {
        // https://stackoverflow.com/questions/40031688/javascript-arraybuffer-to-hex#40031979
        return Array.prototype.map.call(new Uint8Array(ab), x => ('00' + x.toString(16)).slice(-2)).join('');
    };

    u.arrayBufferToString = function (ab) {
        return (new Uint8Array(ab)).reduce((data, byte) => data + String.fromCharCode(byte), '');
    };

    u.stringToArrayBuffer = function (string) {
        const len = string.length,
              bytes = new Uint8Array(len);

        for (let i = 0; i < len; i++) {
            bytes[i] = string.charCodeAt(i)
        }
        return bytes.buffer
    };

    u.arrayBufferToBase64 = function (ab) {
        return btoa((new Uint8Array(ab)).reduce((data, byte) => data + String.fromCharCode(byte), ''));
    };

    u.base64ToArrayBuffer = function (b64) {
        const binary_string =  window.atob(b64),
              len = binary_string.length,
              bytes = new Uint8Array(len);

        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i)
        }
        return bytes.buffer
    };

    u.getRandomInt = function (max) {
        return Math.floor(Math.random() * Math.floor(max));
    };

    u.putCurserAtEnd = function (textarea) {
        if (textarea !== document.activeElement) {
            textarea.focus();
        }
        // Double the length because Opera is inconsistent about whether a carriage return is one character or two.
        const len = textarea.value.length * 2;
        // Timeout seems to be required for Blink
        setTimeout(() => textarea.setSelectionRange(len, len), 1);
        // Scroll to the bottom, in case we're in a tall textarea
        // (Necessary for Firefox and Chrome)
        this.scrollTop = 999999;
    };

    u.getUniqueId = function () {
        return 'xxxxxxxx-xxxx'.replace(/[x]/g, function(c) {
            var r = Math.random() * 16 | 0,
                v = c === 'x' ? r : r & 0x3 | 0x8;
            return v.toString(16);
        });
    };
    return u;
}));
