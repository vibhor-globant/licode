/*global window, console, RTCSessionDescription, RoapConnection, webkitRTCPeerConnection, Promise*/

var Erizo = Erizo || {};

Erizo.FirefoxStack = function (spec) {
    "use strict";

    var that = {},
        WebkitRTCPeerConnection = mozRTCPeerConnection,
        RTCSessionDescription = mozRTCSessionDescription,
        RTCIceCandidate = mozRTCIceCandidate;

    var hasStream = false;

    that.pc_config = {
        "iceServers": []
    };

    if (spec.turnOnly) {
        that.pc_config.iceTransports = "relay";
    }

    if (spec.stunServerUrl !== undefined) {
        that.pc_config.iceServers.push({
            "url": spec.stunServerUrl
        });
    }

    // if ((spec.turnServer || {}).url) {
    //     that.pc_config.iceServers.push({"username": spec.turnServer.username, "credential": spec.turnServer.password, "url": spec.turnServer.url});
    // }

    (spec.turnServers || []).forEach(function (turnServer) {
        if (turnServer.url) {
            that.pc_config.iceServers.push({
                username: turnServer.username,
                credential: turnServer.password,
                url: turnServer.url
            });
        }
    });

    if (spec.audio === undefined) {
        spec.audio = true;
    }

    if (spec.video === undefined) {
        spec.video = true;
    }

    that.mediaConstraints = {
        offerToReceiveAudio: spec.audio,
        offerToReceiveVideo: spec.video,
        mozDontOfferDataChannel: true
    };

    var errorCallback = function (message) {
        L.Logger.error("Error in Stack ", message);
    }
    var gotCandidate = false;
    that.peerConnection = new WebkitRTCPeerConnection(that.pc_config, that.con);
    spec.localCandidates = [];

    that.peerConnection.onicecandidate = function (event) {
        if (event.candidate) {
            if (spec.turnOnly && !event.candidate.candidate.match(/relay/)) {
                return;
            }
            gotCandidate = true;

            if (!event.candidate.candidate.match(/a=/)) {
                event.candidate.candidate = "a=" + event.candidate.candidate;
            };

            if (spec.remoteDescriptionSet) {
                spec.callback({
                    type: 'candidate',
                    candidate: event.candidate
                });
            } else {
                spec.localCandidates.push(event.candidate);
                console.log("Local Candidates stored: ", spec.localCandidates.length, spec.localCandidates);
            }

        } else {
            console.log("End of candidates.");
        }
    };

    that.peerConnection.onaddstream = function (stream) {
        if (that.onaddstream) {
            that.onaddstream(stream);
        }
    };

    that.peerConnection.onremovestream = function (stream) {
        if (that.onremovestream) {
            that.onremovestream(stream);
        }
    };

    that.peerConnection.oniceconnectionstatechange = function (evt) {
        console.log("peerConnection.oniceconnectionstatechange state = " + that.peerConnection.iceConnectionState);
        if (spec.pcUpdate) {
            spec.pcUpdate("oniceconnectionstatechange", {
                iceConnectionState: that.peerConnection.iceConnectionState
            });
        }
    };



    var setMaxBW = function (sdp) {
        if (spec.video && spec.maxVideoBW) {
            var a = sdp.match(/m=video.*\r\n/);
            if (a == null) {
                a = sdp.match(/m=video.*\n/);
            }
            if (a && (a.length > 0)) {
                var r = a[0] + "b=AS:" + spec.maxVideoBW + "\r\n";
                sdp = sdp.replace(a[0], r);
            }
        }

        if (spec.audio && spec.maxAudioBW) {
            var a = sdp.match(/m=audio.*\r\n/);
            if (a == null) {
                a = sdp.match(/m=audio.*\n/);
            }
            if (a && (a.length > 0)) {
                var r = a[0] + "b=AS:" + spec.maxAudioBW + "\r\n";
                sdp = sdp.replace(a[0], r);
            }
        }

        return sdp;
    };

    var localDesc;

    var setLocalDesc = function (sessionDescription) {
        sessionDescription.sdp = setMaxBW(sessionDescription.sdp);
        sessionDescription.sdp = sessionDescription.sdp.replace(/a=ice-options:google-ice\r\n/g, "");
        spec.callback(sessionDescription);
        localDesc = sessionDescription;
    }

    var setLocalDescp2p = function (sessionDescription) {
        sessionDescription.sdp = setMaxBW(sessionDescription.sdp);
        sessionDescription.sdp = sessionDescription.sdp.replace(/a=ice-options:google-ice\r\n/g, "");
        spec.callback(sessionDescription);
        localDesc = sessionDescription;
        that.peerConnection.setLocalDescription(localDesc);
    }

    that.createOffer = function (isSubscribe) {
        if (isSubscribe === true) {
            that.peerConnection.createOffer(setLocalDesc, errorCallback, that.mediaConstraints);
        } else {
            that.peerConnection.createOffer(setLocalDesc, errorCallback);
        }
    };

    that.addStream = function (stream) {
        that.peerConnection.addStream(stream);
    };
    spec.remoteCandidates = [];
    spec.remoteDescriptionSet = false;

    /**
     * Closes the connection.
     */
    that.close = function () {
        that.state = 'closed';
        that.peerConnection.close();
    };

    that.processSignalingMessage = function (msg) {

        //        L.Logger.debug("Process Signaling Message", msg);

        if (msg.type === 'offer') {
            msg.sdp = setMaxBW(msg.sdp);
            that.peerConnection.setRemoteDescription(new RTCSessionDescription(msg), function () {
                that.peerConnection.createAnswer(setLocalDescp2p, function (error) {
                    L.Logger.error("Error", error);
                }, that.mediaConstraints);
                spec.remoteDescriptionSet = true;
            }, function (error) {
                L.Logger.error("Error setting Remote Description", error)
            });
        } else if (msg.type === 'answer') {

            // // For compatibility with only audio in Firefox Revisar
            // if (answer.match(/a=ssrc:55543/)) {
            //     answer = answer.replace(/a=sendrecv\\r\\na=mid:video/, 'a=recvonly\\r\\na=mid:video');
            //     answer = answer.split('a=ssrc:55543')[0] + '"}';
            // }

            console.log("Set remote and local description", msg.sdp);

            msg.sdp = setMaxBW(msg.sdp);

            that.peerConnection.setLocalDescription(localDesc, function () {
                that.peerConnection.setRemoteDescription(new RTCSessionDescription(msg), function () {
                    spec.remoteDescriptionSet = true;
                    L.Logger.info("Remote Description successfully set");
                    while (spec.remoteCandidates.length > 0 && gotCandidate) {
                        L.Logger.info("Setting stored remote candidates")
                            // IMPORTANT: preserve ordering of candidates
                        that.peerConnection.addIceCandidate(spec.remoteCandidates.shift());
                    }
                    while (spec.localCandidates.length > 0) {
                        L.Logger.info("Sending Candidate from list");
                        // IMPORTANT: preserve ordering of candidates
                        spec.callback({
                            type: 'candidate',
                            candidate: spec.localCandidates.shift()
                        });
                    }
                }, function (error) {
                    L.Logger.error("Error Setting Remote Description", error);
                });
            }, function (error) {
                L.Logger.error("Failure setting Local Description", error);
            });

        } else if (msg.type === 'candidate') {
          
            try {
                var obj;
                if (typeof (msg.candidate) === 'object') {
                    obj = msg.candidate;
                } else {
                    obj = JSON.parse(msg.candidate);
                }
                obj.candidate = obj.candidate.replace(/ generation 0/g, "");
                obj.candidate = obj.candidate.replace(/ udp /g, " UDP ");

                obj.sdpMLineIndex = parseInt(obj.sdpMLineIndex);
                var candidate = new RTCIceCandidate(obj);
                //                L.logger.debug("Remote Candidate",candidate);

                if (spec.remoteDescriptionSet && gotCandidate) {
                    that.peerConnection.addIceCandidate(candidate);
                    while (spec.remoteCandidates.length > 0) {
                        L.Logger.info("Setting stored remote candidates")
                            // IMPORTANT: preserve ordering of candidates
                        that.peerConnection.addIceCandidate(spec.remoteCandidates.shift());
                    }
                } else {
                    spec.remoteCandidates.push(candidate);
                }
            } catch (e) {
                L.Logger.error("Error parsing candidate", msg.candidate, e);
            }
        }
    }

    that.getStats = function () {
        return new Promise(function (fulfill) {
            var globalObject = {
                    audio: {},
                    video: {}
                },
                merge = function merge(mergein, mergeto) {
                    if (!mergein) {
                        mergein = {};
                    }
                    if (!mergeto) {
                        return mergein;
                    }

                    for (var item in mergeto) {
                        mergein[item] = mergeto[item];
                    }
                    return mergein;
                },
                reformat = function (results) {
                    var result = {
                        audio: {},
                        video: {},
                        results: results,
                    };
                    var bytes = null,
                        kilobytes = null;

                    for (var i = 0; i < results.length; ++i) {
                        var res = results[i];

                        if (res.googCodecName == 'opus' && res.bytesSent) {
                            if (!globalObject.audio.prevBytesSent) {
                                globalObject.audio.prevBytesSent = res.bytesSent;
                            }

                            bytes = res.bytesSent - globalObject.audio.prevBytesSent;
                            globalObject.audio.prevBytesSent = res.bytesSent;

                            kilobytes = bytes / 1024;

                            result.audio = merge(result.audio, {
                                availableBandwidth: kilobytes.toFixed(1),
                                inputLevel: res.audioInputLevel,
                                packetsLost: res.packetsLost,
                                rtt: res.googRtt,
                                packetsSent: res.packetsSent,
                                bytesSent: res.bytesSent
                            });
                        }

                        if (res.googCodecName == 'VP8') {
                            if (!globalObject.video.prevBytesSent) {
                                globalObject.video.prevBytesSent = res.bytesSent;
                            }

                            bytes = res.bytesSent - globalObject.video.prevBytesSent;
                            globalObject.video.prevBytesSent = res.bytesSent;

                            kilobytes = bytes / 1024;

                            result.video = merge(result.video, {
                                availableBandwidth: kilobytes.toFixed(1),
                                googFrameHeightInput: res.googFrameHeightInput,
                                googFrameWidthInput: res.googFrameWidthInput,
                                googCaptureQueueDelayMsPerS: res.googCaptureQueueDelayMsPerS,
                                rtt: res.googRtt,
                                packetsLost: res.packetsLost,
                                packetsSent: res.packetsSent,
                                googEncodeUsagePercent: res.googEncodeUsagePercent,
                                googCpuLimitedResolution: res.googCpuLimitedResolution,
                                googNacksReceived: res.googNacksReceived,
                                googFrameRateInput: res.googFrameRateInput,
                                googPlisReceived: res.googPlisReceived,
                                googViewLimitedResolution: res.googViewLimitedResolution,
                                googCaptureJitterMs: res.googCaptureJitterMs,
                                googAvgEncodeMs: res.googAvgEncodeMs,
                                googFrameHeightSent: res.googFrameHeightSent,
                                googFrameRateSent: res.googFrameRateSent,
                                googBandwidthLimitedResolution: res.googBandwidthLimitedResolution,
                                googFrameWidthSent: res.googFrameWidthSent,
                                googFirsReceived: res.googFirsReceived,
                                bytesSent: res.bytesSent
                            });
                        }

                        if (res.type == 'VideoBwe') {
                            result.video.bandwidth = {
                                googActualEncBitrate: res.googActualEncBitrate,
                                googAvailableSendBandwidth: res.googAvailableSendBandwidth,
                                googAvailableReceiveBandwidth: res.googAvailableReceiveBandwidth,
                                googRetransmitBitrate: res.googRetransmitBitrate,
                                googTargetEncBitrate: res.googTargetEncBitrate,
                                googBucketDelay: res.googBucketDelay,
                                googTransmitBitrate: res.googTransmitBitrate
                            };
                        }

                        // res.googActiveConnection means either STUN or TURN is used.

                        if (res.type == 'googCandidatePair' && res.googActiveConnection == 'true') {
                            result.connectionType = {
                                local: {
                                    candidateType: res.googLocalCandidateType,
                                    ipAddress: res.googLocalAddress
                                },
                                remote: {
                                    candidateType: res.googRemoteCandidateType,
                                    ipAddress: res.googRemoteAddress
                                },
                                transport: res.googTransportType
                            };
                        }
                    }

                    fulfill(result);
                };

            that.peerConnection.getStats(null, function (res) {
                var items = [];
                res.forEach(function (result) {
                    items.push(result);
                });
                reformat(items);
            }, reformat);
        });
    };
    return that;
};
