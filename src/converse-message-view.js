// Converse.js
// https://conversejs.org
//
// Copyright (c) 2013-2018, the Converse.js developers
// Licensed under the Mozilla Public License (MPLv2)

(function (root, factory) {
    define([
        "utils/emoji",
        "converse-core",
        "xss",
        "filesize",
        "templates/csn.html",
        "templates/file_progress.html",
        "templates/info.html",
        "templates/message.html",
        "templates/message_versions_modal.html",
    ], factory);
}(this, function (
        u,
        converse,
        xss,
        filesize,
        tpl_csn,
        tpl_file_progress,
        tpl_info,
        tpl_message,
        tpl_message_versions_modal
    ) {
    "use strict";
    const { Backbone, _, moment } = converse.env;


    converse.plugins.add('converse-message-view', {

        initialize () {
            /* The initialize function gets called as soon as the plugin is
             * loaded by converse.js's plugin machinery.
             */
            const { _converse } = this,
                { __ } = _converse;

            _converse.ViewWithAvatar = Backbone.NativeView.extend({

                renderAvatar () {
                    const canvas_el = this.el.querySelector('canvas');
                    if (_.isNull(canvas_el)) {
                        return;
                    }
                    const image_type = this.model.vcard.get('image_type'),
                          image = this.model.vcard.get('image'),
                          img_src = "data:" + image_type + ";base64," + image,
                          img = new Image();

                    img.onload = () => {
                        const ctx = canvas_el.getContext('2d'),
                              ratio = img.width / img.height;
                        ctx.clearRect(0, 0, canvas_el.width, canvas_el.height);
                        if (ratio < 1) {
                            ctx.drawImage(img, 0, 0, canvas_el.width, canvas_el.height * (1 / ratio));
                        } else {
                            ctx.drawImage(img, 0, 0, canvas_el.width, canvas_el.height * ratio);
                        }
                    };
                    img.src = img_src;
                },
            });


            _converse.MessageVersionsModal = _converse.BootstrapModal.extend({

                toHTML () {
                    return tpl_message_versions_modal(_.extend(
                        this.model.toJSON(), {
                        '__': __
                    }));
                }
            });


            _converse.MessageView = _converse.ViewWithAvatar.extend({
                events: {
                    'click .chat-msg__edit-modal': 'showMessageVersionsModal'
                },

                initialize () {
                    this.model.vcard.on('change', this.render, this);
                    this.model.on('change:correcting', this.onMessageCorrection, this);
                    this.model.on('change:message', this.render, this);
                    this.model.on('change:progress', this.renderFileUploadProgresBar, this);
                    this.model.on('change:type', this.render, this);
                    this.model.on('change:upload', this.render, this);
                    this.model.on('destroy', this.remove, this);
                    this.render();
                },

                render () {
                    const is_followup = u.hasClass('chat-msg--followup', this.el);
                    let msg;
                    if (this.model.isOnlyChatStateNotification()) {
                        this.renderChatStateNotification()
                    } else if (this.model.get('file') && !this.model.get('oob_url')) {
                        this.renderFileUploadProgresBar();
                    } else if (this.model.get('type') === 'error') {
                        this.renderErrorMessage();
                    } else {
                        this.renderChatMessage();
                    }
                    if (is_followup) {
                        u.addClass('chat-msg--followup', this.el);
                    }
                    return this.el;
                },

                onMessageCorrection () {
                    this.render();
                    if (!this.model.get('correcting') && this.model.changed.message) {
                        this.el.addEventListener('animationend', () => u.removeClass('onload', this.el));
                        u.addClass('onload', this.el);
                    }
                },

                replaceElement (msg) {
                    if (!_.isNil(this.el.parentElement)) {
                        this.el.parentElement.replaceChild(msg, this.el);
                    }
                    this.setElement(msg);
                    return this.el;
                },

                renderChatMessage () {
                    const is_me_message = this.isMeCommand(),
                          moment_time = moment(this.model.get('time')),
                          role = this.model.vcard.get('role'),
                          roles = role ? role.split(',') : [];

                    const msg = u.stringToElement(tpl_message(
                        _.extend(
                            this.model.toJSON(), {
                            '__': __,
                            'is_me_message': is_me_message,
                            'roles': roles,
                            'pretty_time': moment_time.format(_converse.time_format),
                            'time': moment_time.format(),
                            'extra_classes': this.getExtraMessageClasses(),
                            'label_show': __('Show more'),
                            'username': this.model.getDisplayName()
                        })
                    ));

                    const url = this.model.get('oob_url');
                    if (url) {
                        msg.querySelector('.chat-msg__media').innerHTML = _.flow(
                            _.partial(u.renderFileURL, _converse),
                            _.partial(u.renderMovieURL, _converse),
                            _.partial(u.renderAudioURL, _converse),
                            _.partial(u.renderImageURL, _converse))(url);
                    }

                    const encrypted = this.model.get('encrypted');
                    let text = encrypted ? this.model.get('plaintext') : this.model.get('message');
                    if (is_me_message) {
                        text = text.replace(/^\/me/, '');
                    }
                    const msg_content = msg.querySelector('.chat-msg__text');
                    if (text !== url) {
                        text = xss.filterXSS(text, {'whiteList': {}});
                        msg_content.innerHTML = _.flow(
                            _.partial(u.geoUriToHttp, _, _converse.geouri_replacement),
                            _.partial(u.addMentionsMarkup, _, this.model.get('references'), this.model.collection.chatbox),
                            u.addHyperlinks,
                            u.renderNewLines,
                            _.partial(u.addEmoji, _converse, _)
                        )(text);
                    }
                    u.renderImageURLs(_converse, msg_content).then(() => {
                        this.model.collection.trigger('rendered');
                    });
                    this.replaceElement(msg);

                    if (this.model.get('type') !== 'headline') {
                        this.renderAvatar();
                    }
                },

                renderErrorMessage () {
                    const moment_time = moment(this.model.get('time')),
                          msg = u.stringToElement(
                        tpl_info(_.extend(this.model.toJSON(), {
                            'extra_classes': 'chat-error',
                            'isodate': moment_time.format(),
                            'data': ''
                        })));
                    return this.replaceElement(msg);
                },

                renderChatStateNotification () {
                    let text;
                    const from = this.model.get('from'),
                          name = this.model.getDisplayName();

                    if (this.model.get('chat_state') === _converse.COMPOSING) {
                        if (this.model.get('sender') === 'me') {
                            text = __('Typing from another device');
                        } else {
                            text = __('%1$s is typing', name);
                        }
                    } else if (this.model.get('chat_state') === _converse.PAUSED) {
                        if (this.model.get('sender') === 'me') {
                            text = __('Stopped typing on the other device');
                        } else {
                            text = __('%1$s has stopped typing', name);
                        }
                    } else if (this.model.get('chat_state') === _converse.GONE) {
                        text = __('%1$s has gone away', name);
                    } else {
                        return;
                    }
                    const isodate = moment().format();
                    this.replaceElement(
                          u.stringToElement(
                            tpl_csn({
                                'message': text,
                                'from': from,
                                'isodate': isodate
                            })));
                },

                renderFileUploadProgresBar () {
                    const msg = u.stringToElement(tpl_file_progress(
                        _.extend(this.model.toJSON(), {
                            'filesize': filesize(this.model.get('file').size),
                        })));
                    this.replaceElement(msg);
                    this.renderAvatar();
                },

                showMessageVersionsModal (ev) {
                    ev.preventDefault();
                    if (_.isUndefined(this.model.message_versions_modal)) {
                        this.model.message_versions_modal = new _converse.MessageVersionsModal({'model': this.model});
                    }
                    this.model.message_versions_modal.show(ev);
                },

                isMeCommand () {
                    const text = this.model.get('message');
                    if (!text) {
                        return false;
                    }
                    const match = text.match(/^\/(.*?)(?: (.*))?$/);
                    return match && match[1] === 'me';
                },

                processMessageText () {
                    var text = this.get('message');
                    text = u.geoUriToHttp(text, _converse.geouri_replacement);
                },

                getExtraMessageClasses () {
                    let extra_classes = this.model.get('is_delayed') && 'delayed' || '';
                    if (this.model.get('type') === 'groupchat' && this.model.get('sender') === 'them') {
                        if (this.model.collection.chatbox.isUserMentioned(this.model)) {
                            // Add special class to mark groupchat messages
                            // in which we are mentioned.
                            extra_classes += ' mentioned';
                        }
                    }
                    if (this.model.get('correcting')) {
                        extra_classes += ' correcting';
                    }
                    return extra_classes;
                }
            });
        }
    });
    return converse;
}));
