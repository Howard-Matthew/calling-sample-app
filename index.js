// Make sure to install the necessary dependencies
const { CallClient, VideoStreamRenderer, LocalVideoStream, Features, CaptionsCallFeature } = require('@azure/communication-calling');
const { AzureCommunicationTokenCredential } = require('@azure/communication-common');
const { CommunicationIdentityClient } = require('@azure/communication-identity');
const { AzureLogger, setLogLevel } = require("@azure/logger");
const TextTranslationClient = require("@azure-rest/ai-translation-text").default

// Set the log level and output
setLogLevel('warning');
AzureLogger.log = (...args) => {
    console.log(...args);
};

// Translation objects
const apiKey = process.env.AZURE_AI_TRANSLATOR_API_KEY;
const endpoint = process.env.AZURE_AI_TRANSLATOR_ENDPOINT;
const region = process.env.AZURE_AI_TRANSLATOR_REGION;
let translationClient;
let shouldTranslateCaptions = false;

// Calling web sdk objects
let callAgent;
let deviceManager;
let call;
let incomingCall;
let localVideoStream;
let localVideoStreamRenderer;
let captions;
let captionsCallFeature;

// UI widgets
let userAccessToken = document.getElementById('user-access-token');
let calleeAcsUserId = document.getElementById('callee-acs-user-id');
let initializeCallAgentButton = document.getElementById('initialize-call-agent');
let startCallButton = document.getElementById('start-call-button');
let hangUpCallButton = document.getElementById('hangup-call-button');
let acceptCallButton = document.getElementById('accept-call-button');
let startVideoButton = document.getElementById('start-video-button');
let stopVideoButton = document.getElementById('stop-video-button');
let muteButton = document.getElementById('mute-button');
let unmuteButton = document.getElementById('unmute-button');
let connectedLabel = document.getElementById('connectedLabel');
let remoteVideosGallery = document.getElementById('remoteVideosGallery');
let localVideoContainer = document.getElementById('localVideoContainer');
let meetingLinkInput = document.getElementById('teams-link-input');
let meetingIdInput = document.getElementById('teams-meetingId-input');
let meetingPasscodeInput = document.getElementById('teams-passcode-input');
let hangUpButton = document.getElementById('hang-up-button');
let teamsMeetingJoinButton = document.getElementById('join-meeting-button');
let callStateElement = document.getElementById('call-state');
let recordingStateElement = document.getElementById('recording-state');
let startCaptionsButton = document.getElementById('start-captions-button');
let stopCaptionsButton = document.getElementById('stop-captions-button');
let translateCaptionsButton = document.getElementById('translate-captions-button');



const main = async () => {
    console.log("Azure Communication Services - Access Tokens Quickstart")
    // Quickstart code goes here
    const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
    console.log(connectionString);
    
    // Instantiate the identity client
    const identityClient = new CommunicationIdentityClient(connectionString);
    let identityResponse = await identityClient.createUser();
    console.log(`\nCreated an identity with ID: ${identityResponse.communicationUserId}`);
    document.getElementById("userId").innerHTML = identityResponse.communicationUserId;
    // Issue an access token with a validity of 24 hours and the "voip" scope for an identity
    let tokenResponse = await identityClient.getToken(identityResponse, ["voip"]);

    // Get the token and its expiration date from the response
    const { token, expiresOn } = tokenResponse;
    console.log(`\nIssued an access token with 'voip' scope that expires at ${expiresOn}:`);
    console.log(token);

    tokenCredential = new AzureCommunicationTokenCredential(token);
    const callClient = new CallClient();

    callAgent = await callClient.createCallAgent(tokenCredential)
        // Set up a camera device to use.
        deviceManager = await callClient.getDeviceManager();
        await deviceManager.askDevicePermission({ video: true });
        await deviceManager.askDevicePermission({ audio: true });
        // Listen for an incoming call to accept.
        callAgent.on('incomingCall', async (args) => {
            try {
                incomingCall = args.incomingCall;
                acceptCallButton.disabled = false;
                startCallButton.disabled = true;
            } catch (error) {
                console.error(error);
            }
        });

    startCallButton.disabled = false;
    teamsMeetingJoinButton.disabled = false;
    // initializeCallAgentButton.disabled = true;
  };
  
  main().catch((error) => {
    console.log("Encountered an error");
    console.log(error);
  })

/**
 * Place a 1:1 outgoing video call to a user
 * Add an event listener to initiate a call when the `startCallButton` is clicked:
 * First you have to enumerate local cameras using the deviceManager `getCameraList` API.
 * In this quickstart we're using the first camera in the collection. Once the desired camera is selected, a
 * LocalVideoStream instance will be constructed and passed within `videoOptions` as an item within the
 * localVideoStream array to the call method. Once your call connects it will automatically start sending a video stream to the other participant. 
 */
startCallButton.onclick = async () => {
    try {
        const localVideoStream = await createLocalVideoStream();
        const videoOptions = localVideoStream ? { localVideoStreams: [localVideoStream] } : undefined;
        call = callAgent.startCall([{ communicationUserId: calleeAcsUserId.value.trim() }], { videoOptions });
        // Subscribe to the call's properties and events.
        subscribeToCall(call);
    } catch (error) {
        console.error(error);
    }
}

/**
 * Join a Teams meeting
 */
teamsMeetingJoinButton.onclick = async () => {
    try {
        // join with meeting link
        call = callAgent.join({meetingLink: meetingLinkInput.value}, {});

        //(or) to join with meetingId and passcode use the below code snippet.
        //call = callAgent.join({meetingId: meetingIdInput.value, passcode: meetingPasscodeInput.value}, {});
        
        call.on('stateChanged', () => {
            callStateElement.innerText = call.state;
        })

        subscribeToCall(call);
    
        call.api(Features.Recording).on('isRecordingActiveChanged', () => {
            if (call.api(Features.Recording).isRecordingActive) {
                recordingStateElement.innerText = "This call is being recorded";
            }
            else {
                recordingStateElement.innerText = "";
            }
        });
        // toggle button states
        hangUpButton.disabled = false;
        teamsMeetingJoinButton.disabled = true;
    } catch (error) {
        console.error(error);
    }
}

/**
 * Accepting an incoming call with video
 * Add an event listener to accept a call when the `acceptCallButton` is clicked:
 * After subscribing to the `CallAgent.on('incomingCall')` event, you can accept the incoming call.
 * You can pass the local video stream which you want to use to accept the call with.
 */
acceptCallButton.onclick = async () => {
    try {
        const localVideoStream = await createLocalVideoStream();
        const videoOptions = localVideoStream ? { localVideoStreams: [localVideoStream] } : undefined;
        call = await incomingCall.accept({ videoOptions });
        // Subscribe to the call's properties and events.
        subscribeToCall(call);
    } catch (error) {
        console.error(error);
    }
}

/**
 * Subscribe to a call obj.
 * Listen for property changes and collection updates.
 */
subscribeToCall = (call) => {
    try {
        // Inspect the initial call.id value.
        console.log(`Call Id: ${call.id}`);

        // Subscribe to captions
        captionsCallFeature = call.feature(Features.Captions);
        captions = captionsCallFeature.captions;
        subscribeToCaptions(captions);

        //Subscribe to call's 'idChanged' event for value changes.
        call.on('idChanged', () => {
            console.log(`Call Id changed: ${call.id}`); 
        });

        // Inspect the initial call.state value.
        console.log(`Call state: ${call.state}`);
        // Subscribe to call's 'stateChanged' event for value changes.
        call.on('stateChanged', async () => {
            console.log(`Call state changed: ${call.state}`);
            if(call.state === 'Connected') {
                connectedLabel.hidden = false;
                acceptCallButton.disabled = true;
                startCallButton.disabled = true;
                hangUpCallButton.disabled = false;
                startVideoButton.disabled = false;
                stopVideoButton.disabled = false;
                muteButton.disabled = false;
                remoteVideosGallery.hidden = false;
                startCaptionsButton.disabled = false;
            } else if (call.state === 'Disconnected') {
                connectedLabel.hidden = true;
                startCallButton.disabled = false;
                hangUpCallButton.disabled = true;
                startVideoButton.disabled = true;
                stopVideoButton.disabled = true;
                console.log(`Call ended, call end reason={code=${call.callEndReason.code}, subCode=${call.callEndReason.subCode}}`);
            }   
        });

        call.on('isLocalVideoStartedChanged', () => {
            console.log(`isLocalVideoStarted changed: ${call.isLocalVideoStarted}`);
        });
        console.log(`isLocalVideoStarted: ${call.isLocalVideoStarted}`);
        call.localVideoStreams.forEach(async (lvs) => {
            localVideoStream = lvs;
            await displayLocalVideoStream();
        });
        call.on('localVideoStreamsUpdated', e => {
            e.added.forEach(async (lvs) => {
                localVideoStream = lvs;
                await displayLocalVideoStream();
            });
            e.removed.forEach(lvs => {
               removeLocalVideoStream();
            });
        });
        
        // Inspect the call's current remote participants and subscribe to them.
        call.remoteParticipants.forEach(remoteParticipant => {
            subscribeToRemoteParticipant(remoteParticipant);
        });
        // Subscribe to the call's 'remoteParticipantsUpdated' event to be
        // notified when new participants are added to the call or removed from the call.
        call.on('remoteParticipantsUpdated', e => {
            // Subscribe to new remote participants that are added to the call.
            e.added.forEach(remoteParticipant => {
                subscribeToRemoteParticipant(remoteParticipant)
            });
            // Unsubscribe from participants that are removed from the call
            e.removed.forEach(remoteParticipant => {
                console.log('Remote participant removed from the call.');
            });
        });
    } catch (error) {
        console.error(error);
    }
}

subscribeToCaptions = (captions) => {
    try {
        const captionsActiveChangedHandler = () => {
            // Why is this not a method?
            if (captions.isCaptionsFeatureActive) {
                /* USER CODE HERE - E.G. RENDER TO DOM */
                console.log("Captions feature is now active.");
            }
        }
        captions.on('CaptionsActiveChanged', captionsActiveChangedHandler);
        
        const captionsReceivedHandler = async (data) => { 
            /** USER CODE HERE - E.G. RENDER TO DOM 
             * data.resultType
             * data.speaker
             * data.spokenLanguage
             * data.spokenText
             * data.timeStamp
            */
           // Example code:
           // Create a dom element, i.e. div, with id "captionArea" before proceeding with the sample code
            let mri;
            switch (data.speaker.identifier.kind) {
                case 'communicationUser': { mri = data.speaker.identifier.communicationUserId; break; }
                case 'phoneNumber': { mri = data.speaker.identifier.phoneNumber; break; }
            }
            const outgoingCaption = `prefix${mri.replace(/:/g, '').replace(/-/g, '')}`;
        
            let captionArea = document.getElementById("captionArea");

            // Translate to Spanish
            let text = data.spokenText;
            if (shouldTranslateCaptions) {
                text = await translateCaptions(data.spokenText);
            }
            
            const captionText = `${data.timestamp.toUTCString()}
                ${mri}: ${text}`;

        
            let foundCaptionContainer = captionArea.querySelector(`.${outgoingCaption}[isNotFinal='true']`);
            if (!foundCaptionContainer) {
                let captionContainer = document.createElement('div');
                captionContainer.setAttribute('isNotFinal', 'true');
                captionContainer.style['borderBottom'] = '1px solid';
                captionContainer.style['whiteSpace'] = 'pre-line';
                captionContainer.textContent = captionText;
                captionContainer.classList.add(outgoingCaption);
        
                captionArea.appendChild(captionContainer);
            } else {
                foundCaptionContainer.textContent = captionText;
        
                if (data.resultType === 'Final') {
                    foundCaptionContainer.setAttribute('isNotFinal', 'false');
                }
            }
            console.log(captionText);
        }; 
        captions.on('CaptionsReceived', captionsReceivedHandler); 
    } catch (error) {
        console.error(error);
    }
}

translateCaptions = async (textToTranslate) => {
    const inputText = [{ text: textToTranslate }];
    const translateResponse = await translationClient.path("/translate").post({
    body: inputText,
    queryParameters: {
        to: "es",
        from: "en",
    },
    });
    let translatedText = "";
    const translations = translateResponse.body;
    for (const translation of translations) {
        console.log(
            `Caption was '${textToTranslate}' and was translated to: '${translation?.translations[0]?.to}' and the result is: '${translation?.translations[0]?.text}'.`
        );
        translatedText = translatedText + translation?.translations[0]?.text
    }
    return translatedText;
}

/**
 * Subscribe to a remote participant obj.
 * Listen for property changes and collection udpates.
 */
subscribeToRemoteParticipant = (remoteParticipant) => {
    try {
        // Inspect the initial remoteParticipant.state value.
        console.log(`Remote participant state: ${remoteParticipant.state}`);
        // Subscribe to remoteParticipant's 'stateChanged' event for value changes.
        remoteParticipant.on('stateChanged', () => {
            console.log(`Remote participant state changed: ${remoteParticipant.state}`);
        });

        // Inspect the remoteParticipants's current videoStreams and subscribe to them.
        remoteParticipant.videoStreams.forEach(remoteVideoStream => {
            subscribeToRemoteVideoStream(remoteVideoStream)
        });
        // Subscribe to the remoteParticipant's 'videoStreamsUpdated' event to be
        // notified when the remoteParticiapant adds new videoStreams and removes video streams.
        remoteParticipant.on('videoStreamsUpdated', e => {
            // Subscribe to new remote participant's video streams that were added.
            e.added.forEach(remoteVideoStream => {
                subscribeToRemoteVideoStream(remoteVideoStream)
            });
            // Unsubscribe from remote participant's video streams that were removed.
            e.removed.forEach(remoteVideoStream => {
                console.log('Remote participant video stream was removed.');
            })
        });
    } catch (error) {
        console.error(error);
    }
}

/**
 * Subscribe to a remote participant's remote video stream obj.
 * You have to subscribe to the 'isAvailableChanged' event to render the remoteVideoStream. If the 'isAvailable' property
 * changes to 'true', a remote participant is sending a stream. Whenever availability of a remote stream changes
 * you can choose to destroy the whole 'Renderer', a specific 'RendererView' or keep them, but this will result in displaying blank video frame.
 */
subscribeToRemoteVideoStream = async (remoteVideoStream) => {
    let renderer = new VideoStreamRenderer(remoteVideoStream);
    let view;
    let remoteVideoContainer = document.createElement('div');
    remoteVideoContainer.className = 'remote-video-container';

    let loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'loading-spinner';
    remoteVideoStream.on('isReceivingChanged', () => {
        try {
            if (remoteVideoStream.isAvailable) {
                const isReceiving = remoteVideoStream.isReceiving;
                const isLoadingSpinnerActive = remoteVideoContainer.contains(loadingSpinner);
                if (!isReceiving && !isLoadingSpinnerActive) {
                    remoteVideoContainer.appendChild(loadingSpinner);
                } else if (isReceiving && isLoadingSpinnerActive) {
                    remoteVideoContainer.removeChild(loadingSpinner);
                }
            }
        } catch (e) {
            console.error(e);
        }
    });

    const createView = async () => {
        // Create a renderer view for the remote video stream.
        view = await renderer.createView();
        // Attach the renderer view to the UI.
        remoteVideoContainer.appendChild(view.target);
        remoteVideosGallery.appendChild(remoteVideoContainer);
    }

    // Remote participant has switched video on/off
    remoteVideoStream.on('isAvailableChanged', async () => {
        try {
            if (remoteVideoStream.isAvailable) {
                await createView();
            } else {
                view.dispose();
                remoteVideosGallery.removeChild(remoteVideoContainer);
            }
        } catch (e) {
            console.error(e);
        }
    });

    // Remote participant has video on initially.
    if (remoteVideoStream.isAvailable) {
        try {
            await createView();
        } catch (e) {
            console.error(e);
        }
    }
}

/**
 * Start your local video stream.
 * This will send your local video stream to remote participants so they can view it.
 */
startVideoButton.onclick = async () => {
    try {
        const localVideoStream = await createLocalVideoStream();
        await call.startVideo(localVideoStream);
    } catch (error) {
        console.error(error);
    }
}

/**
 * Stop your local video stream.
 * This will stop your local video stream from being sent to remote participants.
 */
stopVideoButton.onclick = async () => {
    try {
        await call.stopVideo(localVideoStream);
    } catch (error) {
        console.error(error);
    }
}

/**
 * Unmute your microphone
 */
unmuteButton.onclick = async () => {
    try {
        await call.unmute();
        muteButton.disabled = false;
    } catch (error) {
        console.error(error);
    }
}

/**
 * Mute your microphone
 */
muteButton.onclick = async () => {
    try {
        await call.mute();
        unmuteButton.disabled = false;
    } catch (error) {
        console.error(error);
    }
}

/**
 * Start your captions.
 */
startCaptionsButton.onclick = async () => {
    try {
        console.log("Starting captions.");
        await captions.startCaptions();
        console.log("Captions Started.");
        startCaptionsButton.disabled = true;
        stopCaptionsButton.disabled = false;
        translateCaptionsButton.disabled = false;
    } catch (error) {
        console.error(error);
    }
}

/**
 * Stop your captions.
 */
stopCaptionsButton.onclick = async () => {
    try {
        console.log("Stopping captions.");
        await captions.stopCaptions();
        console.log("Captions Stopped.");
        startCaptionsButton.disabled = false;
        stopCaptionsButton.disabled = true;
        translateCaptionsButton.disabled = true;
    } catch (error) {
        console.error(error);
    }
}

/**
 * Translate Captions to Spanish.
 */
translateCaptionsButton.onclick = async () => {
    try {
        console.log("Translating captions.");
        const translateCredential = {
            key: apiKey,
            region,
        };
        translationClient = new TextTranslationClient(endpoint,translateCredential);
        shouldTranslateCaptions = true;
        translateCaptionsButton.disabled = true;
    } catch (error) {
        console.error(error);
    }
}

/**
 * To render a LocalVideoStream, you need to create a new instance of VideoStreamRenderer, and then
 * create a new VideoStreamRendererView instance using the asynchronous createView() method.
 * You may then attach view.target to any UI element. 
 */
createLocalVideoStream = async () => {
    const camera = (await deviceManager.getCameras())[0];
    if (camera) {
        return new LocalVideoStream(camera);
    } else {
        console.error(`No camera device found on the system`);
    }
}

/**
 * Display your local video stream preview in your UI
 */
displayLocalVideoStream = async () => {
    try {
        localVideoStreamRenderer = new VideoStreamRenderer(localVideoStream);
        const view = await localVideoStreamRenderer.createView();
        localVideoContainer.hidden = false;
        localVideoContainer.appendChild(view.target);
    } catch (error) {
        console.error(error);
    } 
}

/**
 * Remove your local video stream preview from your UI
 */
removeLocalVideoStream = async() => {
    try {
        localVideoStreamRenderer.dispose();
        localVideoContainer.hidden = true;
    } catch (error) {
        console.error(error);
    } 
}

/**
 * End current call
 */
hangUpCallButton.addEventListener("click", async () => {
    // end the current call
    await call.hangUp();
});




