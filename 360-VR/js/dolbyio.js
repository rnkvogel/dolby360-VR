
const View = millicast.View
const Director = millicast.Director
const Logger = millicast.Logger
var video = null
window.Logger = Logger

const autoReconnect = true

//Get our url
const href = new URL(window.location.href);
//Get or set Defaults
const url = !!href.searchParams.get("url")
  ? href.searchParams.get("url")
  : "wss://turn.millicast.com/millisock";
const streamName = !!href.searchParams.get("id")
? href.searchParams.get("id")  : process.env.MILLICAST_STREAM_NAME;
const streamAccountId = !!href.searchParams.get("ac")
 ? href.searchParams.get("ac") : process.env.MILLICAST_ACCOUNT_ID;
const subToken = !!href.searchParams.get("token");
// ? href.searchParams.get("token"); SubscribingToken - placed here for ease of testing, should come from secure location. (php/nodejs)
console.log (streamName, streamAccountId);


function toggleMute(){
  video.muted = !video.muted;
  if (!video.muted){
  audioBtn.style.visibility = 'hidden';

  }
}


const beginReceiving = async (streamName, streamAccountId) => {
    video = document.querySelector("video");

    const addStream = (stream) => {
        if (video.srcObject) {
            console.log("srcObject exists")
            video.srcObject = stream;
            // already connected but we'll replace it anyway
        } else {
            console.log("new stream")
            video.srcObject = stream;
        }
    }


    if (history.pushState) {
        var newurl = window.location.origin + window.location.pathname + '?streamAccountId=' + streamAccountId + '&streamName=' + streamName;
        window.history.pushState({ path: newurl }, '', newurl);
    }


    // MillicastView object
    let millicastView = null

    const newViewer = (streamName, streamAccountId) => {
        const tokenGenerator = () => Director.getSubscriber(streamName, streamAccountId)
        const millicastView = new View(streamName, tokenGenerator, video, autoReconnect)
        millicastView.on("broadcastEvent", (event) => {
            if (!autoReconnect) return;

            let layers = event.data["layers"] !== null ? event.data["layers"] : {};
            if (event.name === "layers" && Object.keys(layers).length <= 0) {
            }
        });
        millicastView.on("track", (event) => {
            addStream(event.streams[0]);
        });
        return millicastView
    }

    millicastView = await newViewer(streamName, streamAccountId)

    //Start connection to publisher
    try {

        await millicastView.connect()  // peer connection and recieve the stream attach to video ele
    } catch (e) {
        console.log('Connection failed, handle error', e)
        millicastView.reconnect()
    }

    // testing
   // video.addEventListener("click", () => { video.muted = false });

}

