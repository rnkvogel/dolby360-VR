const View = millicast.View
//millicast.View = new millicast.View({events:["active, inactive", "vad", "layers"]});//
const Director = millicast.Director
const Logger = millicast.Logger
window.Logger = Logger
Logger.setLevel(Logger.DEBUG);


//Create viewer
//Get our url
const href = new URL(window.location.href);
//Get or set Defaults
const url = !!href.searchParams.get("url")
let params = new URLSearchParams(document.location.search.substring(1));
let id = params.get('streamId');
let split = id.split('/');
let streamAccountId = split[0];
let streamName = split[1];
const subscriberToken = params.get('token');// SubscribingToken - placed here for ease of testing, should come from secure location. (php/nodejs)
//let subToken ="91c023159feb950e07c1fde7ab6ba5df95d1b3441d4a4e88d";//EXAMPLE
let decoder;


const captionWorker = new Worker("workerReceiver.js");
captionWorker.onmessage = (e) => {
    console.log("📨 Message received from captionWorker:", e.data);

    if (e.data.event === "closedCaption") {
        console.log("📝 Caption from worker:", e.data.text);
        showCaption(e.data.text);

        updateMetadataDisplay({
            message: e.data.text,
            timestamp: new Date().toISOString()
        });
    } else if (e.data.event === "seiMetadata") {
        try {
            const payload = new TextDecoder().decode(new Uint8Array(e.data.data)).replace(/\0/g, "").trim();

            console.log("🧠 Raw SEI Metadata from worker:", payload);

            if (payload.includes("|")) {
                const [message, timestampRaw] = payload.split("|");
                const timestamp = timestampRaw.replace(/_/g, ":");

                updateMetadataDisplay({ message, timestamp });
            } else {
                updateMetadataDisplay({
                    message: payload,
                    timestamp: new Date().toISOString()
                });
            }

        } catch (err) {
            console.warn("⚠️ Failed to decode seiMetadata:", err);
        }
    } else {
        console.log("🔁 Unknown message from captionWorker:", e.data);
    }
};

//IF ADDED MUTE BUTTON 
function toggleMute() {
    video.muted = !video.muted;
    if (!video.muted) {
        audioBtn.style.visibility = 'hidden';

        //video.muted  = false;
    }
}
//Let add some captions this can only be two lines.
function showCaption(text) {
    const el = document.getElementById("caption");
    if (!el) return;
    el.innerHTML = text.replace(/\\n/g, "<br>");
    el.style.opacity = 1;
    clearTimeout(window.ccTimer);
    window.ccTimer = setTimeout(() => {
        el.style.opacity = 0;
    }, 4000);
}
function updateMetadataDisplay({ message, timestamp }) {
    const messageEl = document.getElementById("metadata-display-message");
    const timeEl = document.getElementById("metadata-display-timestamp");

    if (messageEl) messageEl.innerText = `Message: ${message}`;
    if (timeEl) timeEl.innerText = `Timestamp: ${timestamp}`;

    const overlay = document.getElementById("metadata-overlay");
    if (overlay) {
        overlay.innerText = `🧠 ${message}\n🕒 ${timestamp}`;
        overlay.classList.add("highlight");

        // Remove highlight after 600ms
        setTimeout(() => overlay.classList.remove("highlight"), 600);
    }
}

//
const metadata = href.searchParams.get("metadata") === "true";
const enableDRM = href.searchParams.get("drm") === 'true';
const disableVideo = href.searchParams.get("disableVideo") === "true";
const disableAudio = href.searchParams.get("disableAudio") === "true";
const muted =
    href.searchParams.get("muted") === "true" ||
    href.searchParams.get("muted") === null;
const autoplay =
    href.searchParams.get("autoplay") === "true" ||
    href.searchParams.get("autoplay") === null;
const autoReconnect =
    href.searchParams.get("autoReconnect") === "true" ||
    href.searchParams.get("autoReconnect") === null;
const disableControls =
    href.searchParams.get("disableControls") === "true" &&
    href.searchParams.get("disableControls") !== null;
const disableVolume =
    (href.searchParams.get("disableVolume") === "true" &&
        href.searchParams.get("disableVolume") !== null) ||
    disableControls;
const disablePlay =
    (href.searchParams.get("disablePlay") === "true" &&
        href.searchParams.get("disablePlay") !== null) ||
    disableControls;
const disableFull =
    (href.searchParams.get("disableFull") === "true" &&
        href.searchParams.get("disableFull") !== null) ||
    disableControls;



let playing = false;
let fullBtn = document.querySelector("#fullBtn");
let video = document.querySelector("video");

// MillicastView object
let millicastView = null
let hasVideo = false
let hasAudio = false


const tokenGenerator = () =>
    Director.getSubscriber(streamName, streamAccountId, subscriberToken, enableDRM, { metadata: true });

millicastView = new View(streamName, tokenGenerator, { metadata: true }, autoReconnect);


// Utility to add a stream to the video element
const addStreamToVideoElement = (stream) => {
    if (!videoElement) {
        console.error("Video element is not available.");
        return;
    }
    console.log("Adding stream to video element:", stream);
    videoElement.id = stream.id;
    videoElement.srcObject = stream;
};

// Listen for track events
millicastView.on("track", (event) => {
    console.log("Track event received:", event);

    const stream = event.streams[0];
    if (stream) {
        addStreamToVideoElement(stream);
    } else {
        console.error("No streams found in RTCTrackEvent.");
    }

    // Handle fallback case (non-DRM)
    if (!enableDRM) {
        const kind = event.track.kind;
        const isVideo = hasVideo && kind === "video";
        const isAudioOnly = hasAudio && !hasVideo && kind === "audio";
        if (isVideo || isAudioOnly) {
            addStreamToVideoElement(event.streams[0]);
        }
    }
});

// Listen for metadata events
function newViewer() {
    const tokenGenerator = () =>
        Director.getSubscriber(streamName, streamAccountId, subscriberToken, enableDRM, { metadata: true });

    // millicastView = new View(streamName, tokenGenerator, null, autoReconnect);
    millicastView = new View(streamName, tokenGenerator, { metadata: true }, autoReconnect);

    // Handle broadcast events
    millicastView.on("broadcastEvent", (event) => {
        if (!autoReconnect) return;

        if (event.name === "active") {
            const encryption = event.data.encryption;
            if (encryption && enableDRM) {
                const drmOptions = {
                    videoElement: video,
                    audioElement: document.querySelector("audio"),
                    videoEncryptionParams: encryption,
                    videoMid: "0",
                };

                const audioTrackInfo = event.data.tracks.find((track) => track.type === "audio");
                if (audioTrackInfo) {
                    drmOptions.audioMid = audioTrackInfo.mediaId;
                }

                millicastView.configureDRM(drmOptions);
            }

            hasVideo = event.data.tracks.some((track) => track.media === "video");
            hasAudio = event.data.tracks.some((track) => track.media === "audio");
        }
    });

    // Utility to add a stream to the video element
    const addStreamToVideoElement = (stream) => {
        if (!video) {
            console.error("Video element is not available.");
            return;
        }
        console.log("✅ Binding stream to video:", stream);
        video.id = stream.id;
        video.srcObject = stream;
    };

    // Listen for track events
    millicastView.on("track", (event) => {
        console.log("Track event received:", event);
        const stream = event.streams[0];
        if (stream) {
            addStreamToVideoElement(stream);
        } else {
            console.error("No streams found in RTCTrackEvent.");
        }

        if (!enableDRM) {
            if ((hasVideo && event.track.kind === "video") ||
                (hasAudio && !hasVideo && event.track.kind === "audio")) {
                addStreamToVideoElement(event.streams[0]);
            }
        }
    });

    // Listen for metadata events
    // Only handle SEI captions, skip timestamps
    // Listen for metadata events
    millicastView.on("metadata", (metadata) => {
        console.log("🔍 Metadata event received:", metadata);

        if (metadata.unregistered) {
            try {
                const sei = new Uint8Array(metadata.unregistered);
                const pts = performance.now();

                console.log("📦 Raw SEI data (Uint8Array):", sei);
                console.log("📏 SEI byte length:", sei.byteLength);
                console.log("⏱️ Presentation timestamp (PTS):", pts);
                console.log("🔡 Decoded SEI as UTF-8 (if possible):", new TextDecoder().decode(sei));

                if (captionWorker) {
                    captionWorker.postMessage({
                        event: "sei",
                        timestamp: pts,
                        data: sei.buffer
                    }, [sei.buffer]);
                    console.log("📤 SEI sent to captionWorker");
                } else {
                    console.warn("⚠️ captionWorker not initialized. Cannot process SEI.");
                }
            } catch (err) {
                console.warn("❌ Failed to decode SEI data:", err);
            }
        } else {
            console.warn("⚠️ No unregistered metadata payload found in event.");
        }
    });
    return millicastView; // ✅ This was missing
}

////end
const togglePlay = () => {
    if (video.paused) {
        video.play()
    } else {
        video.pause();
    }
};

const toggleFullscreen = () => {
    let fullIcon = fullBtn.children[0];
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        fullIcon.classList.remove("fa-compress");
        fullIcon.classList.add("fa-expand");
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();

            fullIcon.classList.remove("fa-expand");
            fullIcon.classList.add("fa-compress");
        }
    }
};

const addStream = (stream) => {
    playing = true;
    const audio = document.querySelector("audio");

    if (disableVideo || !hasVideo) {
        if (audio) audio.srcObject = stream;
        if (video) video.parentNode.removeChild(video);
        togglePlay();
    } else {
        video.id = stream.id;

        if (!muted) {
            video.removeAttribute("muted");
        }
        if (!autoplay) {
            video.autoplay = false;
            playing = false;
            video.removeAttribute("autoplay");
        }

        // Log decoder load status
        if (typeof _n === "undefined") {
            console.warn("⚠️ _n (CEA-608 decoder) is undefined. Did cea608-decoder.js load?");
            if (!window._n) {
                console.warn("🚫 No global _n reference found on window object.");
            } else {
                console.warn("🔍 window._n exists but not assigned globally?");
            }
        } else {
            console.log("✅ CEA-608 decoder (_n) is loaded and ready.");
        }


        // If a stream already exists on the video element
        if (video.srcObject) {
            const tmp = video.cloneNode(true);
            tmp.muted = video.muted;
            tmp.volume = video.volume;
            tmp.srcObject = stream;

            if (video.playing) {
                try { tmp.play(); } catch (e) { }
            } else if (video.paused) {
                try { tmp.pause(); } catch (e) { }
            }

            // Setup caption decoder if available
            if (typeof _n !== "undefined" && !decoder) {
                console.log("🛠️ Attempting to initialize CEA-608 decoder (_n)");
                try {
                    decoder = new _n(1, {
                        dispatchCue: () => { console.log("📤 dispatchCue called"); },
                        newCue: (start, end, displayMemory) => {
                            console.log("🆕 newCue triggered:", { start, end, displayMemory });

                            try {
                                if (!displayMemory || !Array.isArray(displayMemory.rows)) {
                                    console.warn("⚠️ Invalid displayMemory format", displayMemory);
                                    return;
                                }

                                const lines = displayMemory.rows
                                    .map(row => {
                                        try {
                                            return row.getTextString().trim();
                                        } catch (e) {
                                            console.warn("⚠️ getTextString failed on row:", row, e);
                                            return "";
                                        }
                                    })
                                    .filter(Boolean);

                                console.log("📺 Decoded caption lines:", lines);

                                const text = lines.join("<br>");
                                if (text) {
                                    console.log("🎯 Displaying caption:", text);
                                    showCaption(text);
                                } else {
                                    console.log("⚠️ No text extracted from rows");
                                }

                            } catch (err) {
                                console.warn("❌ Error in caption formatting:", err);
                            }
                        }
                    });
                    console.log("✅ Decoder successfully initialized:", decoder);
                } catch (err) {
                    console.error("❌ Failed to initialize decoder:", err);
                }
            } else if (decoder) {
                console.log("ℹ️ Decoder already initialized:", decoder);
            } else {
                console.warn("🚫 _n decoder is not defined.");
            }



            tmp.addEventListener('loadedmetadata', () => {
                video.parentNode.replaceChild(tmp, video);
                try { video.pause(); } catch (e) { }

                if (document.fullscreenElement === video) {
                    try { document.exitFullscreen(); tmp.requestFullscreen(); } catch (e) { }
                }
                if (document.pictureInPictureElement === video) {
                    try { document.exitPictureInPicture(); tmp.requestPictureInPicture(); } catch (e) { }
                }

                video = tmp;
            });
        } else {
            video.srcObject = stream;
        }

        if (audio) audio.parentNode.removeChild(audio);
    }
};

let isSubscribed = false

const close = () => {
    video.srcObject = null;
    playing = false;
    millicastView?.millicastSignaling?.close();
    millicastView = null
    isSubscribed = false
    return Promise.resolve({});
};

const subscribe = async () => {

    if (millicastView?.isActive() || isSubscribed) {
        return
    }

    try {
        isSubscribed = true
        const options = {
            enableDRM,
            metadata,
            disableVideo,
            disableAudio,
            absCaptureTime: true,
            peerConfig: {
                autoInitStats: true,
                statsIntervalMs: 5000
            }
        };
        window.millicastView = millicastView = newViewer()
        await millicastView.connect(options);

        const pc = millicastView.webRTCPeer?.peerConnection;
        if (receiver.track.kind === "video" && receiver.createEncodedStreams) {
            try {
                const { readable, writable } = receiver.createEncodedStreams();

                const transformer = new TransformStream({
                    async transform(chunk, controller) {
                        const data = new Uint8Array(chunk.data);
                        const nalType = data[0] & 0x1F;

                        if (nalType === 6) {
                            console.log("🎯 Found SEI NAL unit in chunk:", data);

                            captionWorker.postMessage({
                                event: "sei",
                                data: chunk.data
                            }, [chunk.data]);
                        }

                        controller.enqueue(chunk);
                    }
                });

                readable.pipeThrough(transformer).pipeTo(writable);
                console.log("🎥 Transform stream with SEI extraction initialized.");
            } catch (err) {
                console.warn("❌ Failed to create encoded stream for SEI:", err);
            }
        }



        pc.getReceivers().forEach((receiver, index) => {
            if (receiver.track.kind === "video") {
                console.log(`🔎 Receiver[${index}] mid=${receiver.mid}, track id=${receiver.track.id}`);
            }
        });


        millicastView.webRTCPeer.on('stats', (event) => {
            console.log(event)
        });

    } catch (error) {
        if (!autoReconnect) return;
    }
};



document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ DOMContentLoaded event fired");

    let int;
    let lastclientX, lastclientY;

    const startInt = (evt) => {
        console.log("👆 Interaction started:", evt.type);
        if (int) clearInterval(int);
        int = setInterval(() => {
            let clientX = evt.clientX;
            let clientY = evt.clientY;
            if (clientX === lastclientX && clientY === lastclientY) {
                clearInterval(int);
                console.log("🛑 Interaction idle, stopping interval");
            } else {
                lastclientX = clientX;
                lastclientY = clientY;
            }
        }, 1000);
    };

    if (fullBtn) fullBtn.onclick = toggleFullscreen;

    video.onmousemove = (evt) => {
        startInt(evt);
    };
    video.addEventListener("touchstart", (evt) => {
        startInt(evt);
    }, false);

    int = setInterval(() => {
        clearInterval(int);
        console.log("🔁 Initial idle interval cleared");
    }, 2000);

    subscribe();
});


const receiverApplicationId = 'B5B8307B'

window['__onGCastApiAvailable'] = function (isAvailable) {
    if (!isAvailable) {
        return false
    }

    const stateChanged = cast.framework.CastContextEventType.CAST_STATE_CHANGED
    const castContext = cast.framework.CastContext.getInstance()
    castContext.setOptions({
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        receiverApplicationId
    })

    castContext.addEventListener(stateChanged, ({ castState }) => {
        if (castState === cast.framework.CastState.NOT_CONNECTED) {
            subscribe()
        }

        if (castState === cast.framework.CastState.CONNECTED) {
            const castSession = castContext.getCurrentSession()
            const mediaInfo = new chrome.cast.media.MediaInfo(streamName, '')
            mediaInfo.customData = { streamName, accountId }
            mediaInfo.streamType = chrome.cast.media.StreamType.LIVE

            const loadRequest = new chrome.cast.media.LoadRequest(mediaInfo)
            castSession.loadMedia(loadRequest).then(close)
        }
    })
}
