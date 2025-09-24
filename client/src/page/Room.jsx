import React, { useEffect, useState } from "react";
import { useRef } from "react";

import { useNavigate, useParams } from "react-router-dom";

// icons
import { IoChatboxOutline as ChatIcon } from "react-icons/io5";
import { VscTriangleDown as DownIcon } from "react-icons/vsc";
import { FaUsers as UsersIcon } from "react-icons/fa";
import { FiSend as SendIcon } from "react-icons/fi";
import { MdCallEnd as CallEndIcon } from "react-icons/md";
import { MdClear as ClearIcon } from "react-icons/md";
import { AiOutlineLink as LinkIcon } from "react-icons/ai";
import { MdOutlineContentCopy as CopyToClipboardIcon } from "react-icons/md";
// import { MdScreenShare as ScreenShareIcon } from "react-icons/md";
import { IoVideocamSharp as VideoOnIcon } from "react-icons/io5";
import { IoVideocamOff as VideoOffIcon } from "react-icons/io5";
import { AiOutlineShareAlt as ShareIcon } from "react-icons/ai";
import { IoMic as MicOnIcon } from "react-icons/io5";
import { IoMicOff as MicOffIcon } from "react-icons/io5";
import { BsPin as PinIcon } from "react-icons/bs";
import { BsPinFill as PinActiveIcon } from "react-icons/bs";

import { QRCode } from "react-qrcode-logo";
import MeetGridCard from "../components/MeetGridCard";

// framer motion
import { motion, AnimatePresence } from "framer-motion";

// importing audios
import joinSFX from "../sounds/join.mp3";
import msgSFX from "../sounds/message.mp3";
import leaveSFX from "../sounds/leave.mp3";

// simple peer - using CDN global variable
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import Loading from "../components/Loading";
import Login from "../components/Login";

const Room = () => {
  const [loading, setLoading] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const navigate = useNavigate();
  const [micOn, setMicOn] = useState(true);
  const [showChat, setshowChat] = useState(true);
  const [share, setShare] = useState(false);
  const [joinSound] = useState(new Audio(joinSFX));
  const { roomID } = useParams();
  console.log("Room ID from URL:", roomID);
  const chatScroll = useRef();
  const [pin, setPin] = useState(false);
  const [peers, setPeers] = useState([]);
  const socket = useRef();
  const peersRef = useRef([]);

  const [videoActive, setVideoActive] = useState(true);

  const [msgs, setMsgs] = useState([]);
  const [msgText, setMsgText] = useState("");
  const localVideo = useRef();

  // user
  const { user } = useAuth();

  const [particpentsOpen, setParticpentsOpen] = useState(true);
  
  // Permission states
  const [permissionError, setPermissionError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const sendMessage = (e) => {
    e.preventDefault();
    if (msgText) {
      socket.current.emit("send message", {
        roomID,
        from: socket.current.id,
        user: {
          id: user.uid,
          name: user?.displayName,
          profilePic: user.photoURL,
        },
        message: msgText.trim(),
      });
    }
    setMsgText("");
  };

  const requestMediaPermissions = async () => {
    try {
      setPermissionError(null);
      setLoading(true);
      
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

      // Request media permissions with explicit constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      console.log('Media access granted');
      setLoading(false);
      setLocalStream(stream);
      
      // Ensure the video element exists before setting srcObject
      if (localVideo.current) {
        localVideo.current.srcObject = stream;
      } else {
        console.warn('Video element not ready yet, stream will be set when component mounts');
      }
      
      // Join room after getting media access
      console.log("Joining room:", roomID, "with user:", user?.displayName);
      const joinPayload = {
        roomID,
        user: user
          ? {
              uid: user?.uid,
              email: user?.email,
              name: user?.displayName,
              photoURL: user?.photoURL,
            }
          : null,
      };
      console.log("Sending join room payload:", joinPayload);
      
      // Ensure socket is connected before joining room
      if (socket.current.connected) {
        socket.current.emit("join room", joinPayload);
      } else {
        console.log("Socket not connected yet, waiting...");
        socket.current.on("connect", () => {
          console.log("Socket connected, now joining room");
          socket.current.emit("join room", joinPayload);
        });
      }
    
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      setLoading(false);
      setPermissionError(error);
      
      // Handle different types of errors
      let errorMessage = 'Unable to access camera and microphone. Please check your browser settings and try again.';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera and microphone access denied. Please allow permissions and refresh the page.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera or microphone found. Please connect your devices and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Camera or microphone is being used by another application. Please close other applications and try again.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = 'Camera or microphone constraints cannot be satisfied. Please check your device settings.';
      }
      
      throw new Error(errorMessage);
    }
  };

  const retryMediaPermissions = () => {
    if (retryCount < 3) {
      setRetryCount(prev => prev + 1);
      requestMediaPermissions().catch(() => {
        // Error already handled in requestMediaPermissions
      });
    }
  };

  // Effect to set stream when video element becomes available
  useEffect(() => {
    if (localStream && localVideo.current && !localVideo.current.srcObject) {
      localVideo.current.srcObject = localStream;
    }
  }, [localStream, localVideo.current]);

  // Cleanup effect to stop stream when component unmounts
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
        });
      }
    };
  }, [localStream]);

  useEffect(() => {
    const unsub = () => {
      console.log("Connecting to socket server...");
      socket.current = io.connect(
        "https://kretsia-meet-c4zn.vercel.app/"
        // process.env.SOCKET_BACKEND_URL || "http://localhost:5000"
      );
      
      socket.current.on("connect", () => {
        console.log("Socket connected:", socket.current.id);
      });
      
      socket.current.on("disconnect", () => {
        console.log("Socket disconnected");
      });
      
      socket.current.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
      });
      socket.current.on("message", (data) => {
        const audio = new Audio(msgSFX);
        if (user?.uid !== data.user.id) {
          console.log("send");
          audio.play();
        }
        const msg = {
          send: user?.uid === data.user.id,
          ...data,
        };
        setMsgs((msgs) => [...msgs, msg]);
        // setMsgs(data);
        // console.log(data);
      });
      
      if (user) {
        requestMediaPermissions()
          .then((stream) => {
            // Wait for socket to be connected before setting up event listeners
            const setupEventListeners = () => {
              if (!socket.current || !socket.current.connected) {
                console.log("Socket not ready, waiting...");
                setTimeout(setupEventListeners, 100);
                return;
              }
              
              console.log("Socket ready, setting up event listeners");
              
              // Define createPeer function inside socket setup where socket is guaranteed to be available
              const createPeer = (userToSignal, callerID, stream) => {
                console.log("Creating peer for:", userToSignal, "from:", callerID);
                console.log("SimplePeer constructor available:", typeof window.SimplePeer, window.SimplePeer);
                
                if (!window.SimplePeer) {
                  console.error("SimplePeer constructor is not available");
                  return null;
                }
                
                try {
                  const peer = new window.SimplePeer({
                    initiator: true,
                    trickle: false,
                    stream,
                  });

                peer.on("signal", (signal) => {
                  console.log("Sending signal to:", userToSignal);
                  if (socket.current && socket.current.connected) {
                    socket.current.emit("sending signal", {
                      userToSignal,
                      callerID,
                      signal,
                      user: user
                        ? {
                            uid: user?.uid,
                            email: user?.email,
                            name: user?.displayName,
                            photoURL: user?.photoURL,
                          }
                        : null,
                    });
                  } else {
                    console.error("Socket not available when trying to send signal");
                  }
                });

                peer.on("connect", () => {
                  console.log("Peer connected:", userToSignal);
                });

                peer.on("error", (err) => {
                  console.error("Peer error:", err);
                });

                return peer;
                } catch (error) {
                  console.error("Error creating peer:", error);
                  return null;
                }
              };
              
              // Define addPeer function inside socket setup
              const addPeer = (incomingSignal, callerID, stream) => {
                console.log("Adding peer for:", callerID);
                console.log("SimplePeer constructor available:", typeof window.SimplePeer, window.SimplePeer);
                
                if (!window.SimplePeer) {
                  console.error("SimplePeer constructor is not available");
                  return null;
                }
                
                try {
                  const peer = new window.SimplePeer({
                    initiator: false,
                    trickle: false,
                    stream,
                  });
                peer.on("signal", (signal) => {
                  console.log("Returning signal to:", callerID);
                  if (socket.current && socket.current.connected) {
                    socket.current.emit("returning signal", { signal, callerID });
                  } else {
                    console.error("Socket not available when trying to return signal");
                  }
                });
                
                peer.on("connect", () => {
                  console.log("Peer connected:", callerID);
                });

                peer.on("error", (err) => {
                  console.error("Peer error:", err);
                });

                joinSound.play();
                peer.signal(incomingSignal);
                return peer;
                } catch (error) {
                  console.error("Error creating peer:", error);
                  return null;
                }
              };
              
              // Set up socket event listeners after successful media access
              socket.current.on("all users", (users) => {
              console.log("Received all users:", users);
              console.log("Current socket ID:", socket.current.id);
              console.log("Creating peers for", users.length, "users");
              
              const peers = [];
              users.forEach((user) => {
                console.log("Creating peer for user:", user.userId, "from:", socket.current.id);
                const peer = createPeer(user.userId, socket.current.id, stream);
                if (peer) {
                  peersRef.current.push({
                    peerID: user.userId,
                    peer,
                    user: user.user,
                  });
                  peers.push({
                    peerID: user.userId,
                    peer,
                    user: user.user,
                  });
                } else {
                  console.error("Failed to create peer for user:", user.userId);
                }
              });
              console.log("Setting peers:", peers);
              setPeers(peers);
            });

            socket.current.on("user joined", (payload) => {
              console.log("User joined event received:", payload);
              console.log("Current socket ID:", socket.current.id);
              console.log("Caller ID:", payload.callerID);
              
              if (payload.signal) {
                console.log("Adding peer with signal");
                const peer = addPeer(payload.signal, payload.callerID, stream);
                if (peer) {
                  peersRef.current.push({
                    peerID: payload.callerID,
                    peer,
                    user: payload.user,
                  });

                  const peerObj = {
                    peerID: payload.callerID,
                    peer,
                    user: payload.user,
                  };

                  setPeers((users) => [...users, peerObj]);
                } else {
                  console.error("Failed to create peer for caller:", payload.callerID);
                }
              } else {
                console.log("User joined without signal - this is just a notification");
              }
            });

            socket.current.on("receiving returned signal", (payload) => {
              console.log("Receiving returned signal:", payload);
              const item = peersRef.current.find(
                (p) => p.peerID === payload.id
              );
              if (item) {
                item.peer.signal(payload.signal);
              } else {
                console.warn("Peer not found for signal:", payload.id);
              }
            });

            socket.current.on("user left", (id) => {
              const audio = new Audio(leaveSFX);
              audio.play();
              const peerObj = peersRef.current.find((p) => p.peerID === id);
              if (peerObj) peerObj.peer.destroy();
              const peers = peersRef.current.filter((p) => p.peerID !== id);
              peersRef.current = peers;
              setPeers((users) => users.filter((p) => p.peerID !== id));
            });
            };
            
            // Start setting up event listeners
            setupEventListeners();
          })
          .catch((error) => {
            console.error('Failed to get media permissions:', error);
            // Error is already handled in requestMediaPermissions
          });
      }
    };
    return unsub();
  }, [user, roomID]);


  return (
    <>
      {user ? (
        <AnimatePresence>
          {loading ? (
            <div className="bg-darkBlue2 h-screen flex items-center justify-center">
              <div className="flex flex-col items-center text-white">
                <div
                  style={{ borderTopColor: "transparent" }}
                  className="w-16 h-16 border-8 border-white border-solid rounded-full animate-spin"
                ></div>
                <p className="mt-5 text-xl font-bold">
                  Requesting Camera & Microphone Access...
                </p>
                <p className="mt-2 text-sm text-gray-300 text-center max-w-md">
                  Please allow camera and microphone permissions when prompted by your browser.
                </p>
              </div>
            </div>
          ) : permissionError ? (
            <div className="bg-darkBlue2 h-screen flex items-center justify-center">
              <div className="bg-white p-8 rounded-lg shadow-lg max-w-md mx-4 text-center">
                <div className="text-red-500 text-6xl mb-4">⚠️</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  Camera & Microphone Access Required
                </h2>
                <p className="text-gray-600 mb-6">
                  {permissionError.message || 'Unable to access camera and microphone. Please check your browser settings and try again.'}
                </p>
                <div className="space-y-3">
                  <button
                    onClick={retryMediaPermissions}
                    disabled={retryCount >= 3}
                    className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                  >
                    {retryCount >= 3 ? 'Max Retries Reached' : `Try Again (${retryCount}/3)`}
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                  >
                    Refresh Page
                  </button>
                  <button
                    onClick={() => navigate('/')}
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                  >
                    Leave Room
                  </button>
                </div>
                <div className="mt-6 text-sm text-gray-500">
                  <p className="mb-2">If the problem persists:</p>
                  <ul className="text-left space-y-1">
                    <li>• Check your browser's camera/mic permissions</li>
                    <li>• Make sure no other app is using your camera</li>
                    <li>• Try refreshing the page</li>
                    <li>• Try a different browser</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            user && (
              <motion.div
                layout
                className="flex flex-row bg-darkBlue2 text-white w-full"
              >
                <motion.div
                  layout
                  className="flex flex-col bg-darkBlue2 justify-between w-full"
                >
                  <div
                    className="flex-shrink-0 overflow-y-scroll p-3"
                    style={{
                      height: "calc(100vh - 128px)",
                    }}
                  >
                    <motion.div
                      layout
                      className={`grid grid-cols-1 gap-4  ${
                        showChat
                          ? "md:grid-cols-2"
                          : "lg:grid-cols-3 sm:grid-cols-2"
                      } `}
                    >
                      <motion.div
                        layout
                        className={`relative bg-lightGray rounded-lg aspect-video overflow-hidden ${
                          pin &&
                          "md:col-span-2 md:row-span-2 md:col-start-1 md:row-start-1"
                        }`}
                      >
                        <div className="absolute top-4 right-4 z-20">
                          <button
                            className={`${
                              pin
                                ? "bg-blue border-transparent"
                                : "bg-slate-800/70 backdrop-blur border-gray"
                            } md:border-2 border-[1px] aspect-square md:p-2.5 p-1.5 cursor-pointer md:rounded-xl rounded-lg text-white md:text-xl text-lg`}
                            onClick={() => setPin(!pin)}
                          >
                            {pin ? <PinActiveIcon /> : <PinIcon />}
                          </button>
                        </div>

                        <video
                          ref={localVideo}
                          muted
                          autoPlay
                          playsInline
                          controls={false}
                          className="h-full w-full object-cover rounded-lg"
                          onLoadedMetadata={() => {
                            // Ensure stream is set when video is ready
                            if (localStream && localVideo.current && !localVideo.current.srcObject) {
                              localVideo.current.srcObject = localStream;
                            }
                          }}
                        />
                        {!videoActive && (
                          <div className="absolute top-0 left-0 bg-lightGray h-full w-full flex items-center justify-center">
                            <img
                              className="h-[35%] max-h-[150px] w-auto rounded-full aspect-square object-cover"
                              src={user?.photoURL}
                              alt={user?.displayName}
                            />
                          </div>
                        )}

                        <div className="absolute bottom-4 right-4">
                          {/* <button
                          className={`${
                            micOn
                              ? "bg-blue border-transparent"
                              : "bg-slate-800/70 backdrop-blur border-gray"
                          } border-2  p-2 cursor-pointer rounded-xl text-white text-xl`}
                          onClick={() => {
                            const audio =
                              localVideo.current.srcObject.getAudioTracks()[0];
                            if (micOn) {
                              audio.enabled = false;
                              setMicOn(false);
                            }
                            if (!micOn) {
                              audio.enabled = true;
                              setMicOn(true);
                            }
                          }}
                        >
                          {micOn ? <MicOnIcon /> : <MicOffIcon />}
                        </button> */}
                        </div>
                        <div className="absolute bottom-4 left-4">
                          <div className="bg-slate-800/70 backdrop-blur border-gray border-2  py-1 px-3 cursor-pointer rounded-md text-white text-xs">
                            {user?.displayName}
                          </div>
                        </div>
                        <div className="absolute top-4 left-4">
                          <div className="bg-slate-800/70 backdrop-blur border-gray border-2  py-1 px-3 cursor-pointer rounded-md text-white text-xs">
                            Peers: {peers.length}
                          </div>
                        </div>
                        <div className="absolute top-4 left-24">
                          <div className="bg-slate-800/70 backdrop-blur border-gray border-2  py-1 px-3 cursor-pointer rounded-md text-white text-xs">
                            Room: {roomID?.slice(0, 8)}...
                          </div>
                        </div>
                      </motion.div>
                      {peers.map((peer) => {
                        console.log("Rendering peer:", peer);
                        return (
                          <MeetGridCard
                            key={peer?.peerID}
                            user={peer.user}
                            peer={peer?.peer}
                          />
                        );
                      })}
                    </motion.div>
                  </div>
                  <div className="w-full h-16 bg-darkBlue1 border-t-2 border-lightGray p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <div>
                          <button
                            className={`${
                              micOn
                                ? "bg-blue border-transparent"
                                : "bg-slate-800/70 backdrop-blur border-gray"
                            } border-2  p-2 cursor-pointer rounded-xl text-white text-xl`}
                            onClick={() => {
                              const audio =
                                localVideo.current.srcObject.getAudioTracks()[0];
                              if (micOn) {
                                audio.enabled = false;
                                setMicOn(false);
                              }
                              if (!micOn) {
                                audio.enabled = true;
                                setMicOn(true);
                              }
                            }}
                          >
                            {micOn ? <MicOnIcon /> : <MicOffIcon />}
                          </button>
                        </div>
                        <div>
                          <button
                            className={`${
                              videoActive
                                ? "bg-blue border-transparent"
                                : "bg-slate-800/70 backdrop-blur border-gray"
                            } border-2  p-2 cursor-pointer rounded-xl text-white text-xl`}
                            onClick={() => {
                              const videoTrack = localStream
                                .getTracks()
                                .find((track) => track.kind === "video");
                              if (videoActive) {
                                videoTrack.enabled = false;
                              } else {
                                videoTrack.enabled = true;
                              }
                              setVideoActive(!videoActive);
                            }}
                          >
                            {videoActive ? <VideoOnIcon /> : <VideoOffIcon />}
                          </button>
                        </div>
                        {/* <div>
                          <button
                            className={`bg-blue border-transparent
           border-2  p-2 cursor-pointer rounded-xl text-white text-xl`}
                          >
                            <UsersIcon />
                          </button>
                        </div> */}
                      </div>
                      <div className="flex-grow flex justify-center">
                        <button
                          className="py-2 px-4 flex items-center gap-2 rounded-lg bg-red"
                          onClick={() => {
                            navigate("/");
                            window.location.reload();
                          }}
                        >
                          <CallEndIcon size={20} />
                          <span className="hidden sm:block text-xs">
                            End Call
                          </span>
                        </button>
                      </div>
                      <div className="flex gap-2">
                        {/* <div>
                          <button
                            className={`bg-slate-800/70 backdrop-blur border-gray
          border-2  p-2 cursor-pointer rounded-xl text-white text-xl`}
                          >
                            <ScreenShareIcon size={22} />
                          </button>
                        </div> */}
                        <div>
                          <button
                            className={`bg-slate-800/70 backdrop-blur border-gray
          border-2  p-2 cursor-pointer rounded-xl text-white text-xl`}
                            onClick={() => setShare(true)}
                          >
                            <ShareIcon size={22} />
                          </button>
                        </div>
                        <div>
                          <button
                            className={`${
                              showChat
                                ? "bg-blue border-transparent"
                                : "bg-slate-800/70 backdrop-blur border-gray"
                            } border-2  p-2 cursor-pointer rounded-xl text-white text-xl`}
                            onClick={() => {
                              setshowChat(!showChat);
                            }}
                          >
                            <ChatIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
                {showChat && (
                  <motion.div
                    layout
                    className="flex flex-col w-[30%] flex-shrink-0 border-l-2 border-lightGray"
                  >
                    <div
                      className="flex-shrink-0 overflow-y-scroll"
                      style={{
                        height: "calc(100vh - 128px)",
                      }}
                    >
                      <div className="flex flex-col bg-darkBlue1 w-full border-b-2 border-gray">
                        <div
                          className="flex items-center w-full p-3 cursor-pointer"
                          onClick={() => setParticpentsOpen(!particpentsOpen)}
                        >
                          <div className="text-xl text-slate-400">
                            <UsersIcon />
                          </div>
                          <div className="ml-2 text-sm font">Particpents</div>
                          <div
                            className={`${
                              particpentsOpen && "rotate-180"
                            } transition-all  ml-auto text-lg`}
                          >
                            <DownIcon />
                          </div>
                        </div>
                        <motion.div
                          layout
                          className={`${
                            particpentsOpen ? "block" : "hidden"
                          } flex flex-col w-full mt-2 h-full max-h-[50vh] overflow-y-scroll gap-3 p-2 bg-blue-600`}
                        >
                          <AnimatePresence>
                            <motion.div
                              layout
                              initial={{ x: 100, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              transition={{ duration: 0.08 }}
                              exit={{ opacity: 0 }}
                              whileHover={{ scale: 1.05 }}
                              className="p-2 flex bg-gray items-center transition-all hover:bg-slate-900 gap-2 rounded-lg"
                            >
                              <img
                                src={
                                  user.photoURL ||
                                  "https://parkridgevet.com.au/wp-content/uploads/2020/11/Profile-300x300.png"
                                }
                                alt={user.displayName || "Anonymous"}
                                className="block w-8 h-8 aspect-square rounded-full mr-2"
                              />
                              <span className="font-medium text-sm">
                                {user.displayName || "Anonymous"}
                              </span>
                            </motion.div>
                            {peers.map((user) => (
                              <motion.div
                                layout
                                initial={{ x: 100, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ duration: 0.08 }}
                                exit={{ opacity: 0 }}
                                key={user.peerID}
                                whileHover={{ scale: 1.05 }}
                                className="p-2 flex bg-gray items-center transition-all hover:bg-slate-900 gap-2 rounded-lg"
                              >
                                <img
                                  src={
                                    user.user.photoURL ||
                                    "https://parkridgevet.com.au/wp-content/uploads/2020/11/Profile-300x300.png"
                                  }
                                  alt={user.user.name || "Anonymous"}
                                  className="block w-8 h-8 aspect-square rounded-full mr-2"
                                />
                                <span className="font-medium text-sm">
                                  {user.user.name || "Anonymous"}
                                </span>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </motion.div>
                      </div>
                      <div className="h-full">
                        <div className="flex items-center bg-darkBlue1 p-3 w-full">
                          <div className="text-xl text-slate-400">
                            <ChatIcon />
                          </div>
                          <div className="ml-2 text-sm font">Chat</div>
                          <div
                            className="ml-auto text-lg"
                            onClick={() => setParticpentsOpen(!particpentsOpen)}
                          >
                            <DownIcon />
                          </div>
                        </div>
                        <motion.div
                          layout
                          ref={chatScroll}
                          className="p-3 h-full overflow-y-scroll flex flex-col gap-4"
                        >
                          {msgs.map((msg, index) => (
                            <motion.div
                              layout
                              initial={{ x: msg.send ? 100 : -100, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              transition={{ duration: 0.08 }}
                              className={`flex gap-2 ${
                                msg?.user.id === user?.uid
                                  ? "flex-row-reverse"
                                  : ""
                              }`}
                              key={index}
                            >
                              <img
                                // src="https://avatars.githubusercontent.com/u/83828231"
                                src={msg?.user.profilePic}
                                alt={msg?.user.name}
                                className="h-8 w-8 aspect-square rounded-full object-cover"
                              />
                              <p className="bg-darkBlue1 py-2 px-3 text-xs w-auto max-w-[87%] rounded-lg border-2 border-lightGray">
                                {msg?.message}
                              </p>
                            </motion.div>
                          ))}
                        </motion.div>
                      </div>
                    </div>
                    <div className="w-full h-16 bg-darkBlue1 border-t-2 border-lightGray p-3">
                      <form onSubmit={sendMessage}>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-grow">
                            <input
                              type="text"
                              value={msgText}
                              onChange={(e) => setMsgText(e.target.value)}
                              className="h-10 p-3 w-full text-sm text-darkBlue1 outline-none  rounded-lg"
                              placeholder="Enter message.. "
                            />
                            {msgText && (
                              <button
                                type="button"
                                onClick={() => setMsgText("")}
                                className="bg-transparent text-darkBlue2 absolute top-0 right-0 text-lg cursor-pointer p-2  h-full"
                              >
                                <ClearIcon />
                              </button>
                            )}
                          </div>
                          <div>
                            <button className="bg-blue h-10 text-md aspect-square rounded-lg flex items-center justify-center">
                              <SendIcon />
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )
          )}
          {share && (
            <div className="fixed flex items-center justify-center top-0 left-0 h-full w-full z-30 bg-slate-800/60 backdrop-blur">
              <div className="bg-white  p-3 rounded shadow shadow-white w-full mx-auto max-w-[500px] relative">
                <div className="flex items-center justify-between">
                  <div className="text-slate-800">
                    Share the link with someone to join the room
                  </div>
                  <div>
                    <ClearIcon
                      size={30}
                      color="#121212"
                      onClick={() => setShare(false)}
                    />
                  </div>
                </div>
                <div className="my-5 rounded flex items-center justify-between gap-2 text-sm text-slate-500 bg-slate-200 p-2 ">
                  <LinkIcon />
                  <div className="flex-grow">
                    {window.location.href.length > 40
                      ? `${window.location.href.slice(0, 37)}...`
                      : window.location.href}
                  </div>
                  <CopyToClipboardIcon
                    className="cursor-pointer"
                    onClick={() =>
                      navigator.clipboard.writeText(window.location.href)
                    }
                  />
                </div>
                <div className="flex w-full aspect-square h-full justify-center items-center">
                  <QRCode
                    // className="hidden"
                    size={200}
                    value={window.location.href}
                    logoImage="/images/logo.png"
                    qrStyle="dots"
                    style={{ width: "100%" }}
                    eyeRadius={10}
                  />
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      ) : (
        <div className="h-full bg-darkBlue2 flex items-center justify-center">
          <div className="text-center">
            <Login />
          </div>
        </div>
      )}
    </>
  );
};

export default Room;
