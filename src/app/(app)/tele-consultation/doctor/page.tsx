"use client"
import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { MediaConnection } from "peerjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneOff, Phone, Video, Mic, User, CheckCircle, Copy, Loader2, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Generate random doctor ID
const generateDoctorId = () => `DR-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

export default function DoctorTeleConsultation() {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerIdInput, setRemotePeerIdInput] = useState('');
  const [currentCall, setCurrentCall] = useState<MediaConnection | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  // Memoized toast to prevent dependency issues
  const showToast = useCallback((title: string, description: string, variant?: "default" | "destructive") => {
    toast({
      title,
      description,
      variant,
    });
  }, [toast]);

  useEffect(() => {
    const doctorId = generateDoctorId();
    
    // Use free PeerJS cloud server instead of local server
    const p = new Peer(doctorId, {
      debug: 2,
      config: {
        'iceServers': [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    p.on('open', id => {
      console.log("Doctor Peer ID:", id);
      setPeerId(id);
      setIsConnected(true);
      showToast("Connected to Server", `Your Doctor ID: ${id}`);
    });

    p.on('call', call => {
      console.log("Incoming call from patient:", call.peer);
      if (localStreamRef.current) {
        call.answer(localStreamRef.current);
        setCurrentCall(call);
        setIsCallActive(true);

        call.on('stream', stream => {
          console.log('Received patient video stream');
          setHasRemoteStream(true);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.play().catch(e => console.log('Remote video play error:', e));
          }
        });

        call.on('close', () => {
          console.log('Call ended by patient');
          setIsCallActive(false);
          setCurrentCall(null);
          setHasRemoteStream(false);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
          }
        });

        call.on('error', (err) => {
          console.error('Call error:', err);
          showToast("Call Error", "There was an issue with the video call", "destructive");
        });

        showToast("Patient Connected!", "Video consultation started with Patient");
      } else {
        console.error('No local stream available to answer call');
        showToast("Cannot Answer Call", "Camera not ready. Please refresh and try again.", "destructive");
      }
    });

    p.on('error', (err) => {
      console.error('PeerJS error:', err);
      showToast("Connection Error", `Failed to connect: ${err.message}`, "destructive");
    });

    setPeer(p);

    return () => p.destroy();
  }, []); // Remove toast from dependencies

  // Get camera permission and local stream
  useEffect(() => {
    const getCameraPermission = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasCameraPermission(false);
        showToast("Unsupported Browser", "Your browser does not support camera access.", "destructive");
        return;
      }
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 }, 
          audio: true 
        });
        
        setHasCameraPermission(true);
        localStreamRef.current = stream;
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(e => console.log('Local video play error:', e));
        }
        
        console.log('Doctor camera ready');
        showToast("Camera Ready", "Your camera and microphone are ready for consultation");
      } catch (error) {
        console.error("Error accessing camera:", error);
        setHasCameraPermission(false);
        showToast("Camera Access Denied", "Please enable camera and microphone permissions.", "destructive");
      }
    };

    getCameraPermission();
    
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []); // Remove toast from dependencies

  const copyPeerIdToClipboard = () => {
    navigator.clipboard.writeText(peerId);
    showToast("Copied!", "Doctor ID copied to clipboard");
  };

  const makeCall = () => {
    if (!peer || !remotePeerIdInput || !localStreamRef.current) {
      showToast("Cannot Make Call", "Please ensure you're connected and have entered a patient ID", "destructive");
      return;
    }

    console.log('Doctor calling patient:', remotePeerIdInput);
    const call = peer.call(remotePeerIdInput, localStreamRef.current);
    setCurrentCall(call);
    setIsCallActive(true);

    call.on('stream', (remoteStream) => {
      console.log('Received patient video stream');
      setHasRemoteStream(true);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(e => console.log('Remote video play error:', e));
      }
    });

    call.on('close', () => {
      console.log('Call closed');
      setIsCallActive(false);
      setCurrentCall(null);
      setHasRemoteStream(false);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    });

    call.on('error', (err) => {
      console.error('Call error:', err);
      setIsCallActive(false);
      setCurrentCall(null);
      setHasRemoteStream(false);
      showToast("Call Failed", "Could not connect to patient. Please check the Patient ID.", "destructive");
    });

    showToast("Calling Patient...", `Connecting to Patient ID: ${remotePeerIdInput}`);
  };

  const endCall = () => {
    if (currentCall) {
      currentCall.close();
      setCurrentCall(null);
      setIsCallActive(false);
      setHasRemoteStream(false);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      showToast("Call Ended", "The consultation has been terminated");
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoMuted(!videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Doctor Tele-Consultation</h1>
      
      {/* Connection Status */}
      <Alert className="mb-4">
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Doctor Connection Status</AlertTitle>
        <AlertDescription>
          {isConnected ? (
            <div className="flex items-center gap-2">
              <span>Ready - Share this Doctor ID with your patient: <strong>{peerId}</strong></span>
              <Button variant="outline" size="sm" onClick={copyPeerIdToClipboard}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            "Connecting to server..."
          )}
        </AlertDescription>
      </Alert>

      {/* Call Controls */}
      {!isCallActive && (
        <div className="flex gap-2 mb-4">
          <Input 
            placeholder="Enter patient ID to call (patient can also call you)" 
            value={remotePeerIdInput} 
            onChange={e => setRemotePeerIdInput(e.target.value)} 
            className="flex-1"
          />
          <Button onClick={makeCall} disabled={!remotePeerIdInput || !isConnected}>
            <Phone className="h-4 w-4 mr-2"/> Call Patient
          </Button>
        </div>
      )}

      {/* Video Display */}
      <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-gray-900 mb-4">
        {/* Main Video Area - Patient's Video */}
        <div className="relative w-full h-full">
          <video 
            ref={remoteVideoRef} 
            className="w-full h-full object-cover" 
            autoPlay 
            playsInline 
            style={{ display: hasRemoteStream ? 'block' : 'none' }}
          />
          
          {/* Waiting State - Show when no remote stream */}
          {!hasRemoteStream && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-white">
              <div className="text-center">
                <User className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-semibold mb-2">
                  {isCallActive ? 'Connecting to Patient...' : 'Waiting for Patient'}
                </p>
                <p className="text-sm text-gray-300">
                  {isCallActive ? 'Video call in progress' : 'Patient will join using your Doctor ID'}
                </p>
                {hasCameraPermission && (
                  <p className="text-xs text-green-400 mt-2">✓ Your camera is ready</p>
                )}
              </div>
            </div>
          )}

          {/* Call Status Indicators */}
          {isCallActive && (
            <div className="absolute top-4 left-4 bg-green-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
              🟢 {hasRemoteStream ? 'Patient Connected' : 'Connecting...'}
            </div>
          )}

          {hasRemoteStream && (
            <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1 rounded text-sm">
              Patient's Video
            </div>
          )}
        </div>

        {/* Doctor's Own Video - Picture-in-Picture */}
        <div className="absolute bottom-4 right-4 w-1/3 aspect-video rounded-lg overflow-hidden border-2 border-white shadow-lg bg-gray-800">
          <video 
            ref={localVideoRef} 
            className="w-full h-full object-cover" 
            autoPlay 
            muted 
            playsInline 
          />
          
          {/* Camera Status Overlays */}
          {hasCameraPermission === null && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-700 text-white">
              <div className="text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p className="text-xs">Loading Camera...</p>
              </div>
            </div>
          )}
          
          {hasCameraPermission === false && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-900 text-white">
              <div className="text-center">
                <Camera className="h-6 w-6 mx-auto mb-2 text-red-400" />
                <p className="text-xs">Camera Denied</p>
              </div>
            </div>
          )}

          {/* Video Muted Overlay */}
          {isVideoMuted && hasCameraPermission && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white">
              <div className="text-center">
                <Video className="h-6 w-6 mx-auto mb-2 line-through text-gray-400" />
                <p className="text-xs">Video Off</p>
              </div>
            </div>
          )}

          {/* Doctor Label */}
          <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-2 py-1 rounded">
            You (Doctor)
          </div>
        </div>
      </div>

      {/* Call Controls */}
      <div className="flex justify-center items-center gap-4 mb-6">
        <Button 
          variant={isAudioMuted ? "destructive" : "secondary"} 
          size="icon" 
          className="rounded-full h-12 w-12"
          onClick={toggleAudio}
          disabled={!hasCameraPermission}
          title={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          <Mic className={`h-6 w-6 ${isAudioMuted ? 'line-through' : ''}`} />
        </Button>
        <Button 
          variant={isVideoMuted ? "destructive" : "secondary"} 
          size="icon" 
          className="rounded-full h-12 w-12"
          onClick={toggleVideo}
          disabled={!hasCameraPermission}
          title={isVideoMuted ? "Turn On Camera" : "Turn Off Camera"}
        >
          <Video className={`h-6 w-6 ${isVideoMuted ? 'line-through' : ''}`} />
        </Button>
        <Button 
          variant="destructive" 
          size="icon" 
          className="rounded-full h-12 w-12"
          onClick={endCall}
          disabled={!isCallActive}
          title="End Call"
        >
          <PhoneOff className="h-6 w-6" />
        </Button>
      </div>

      {/* Status Information */}
      <div className="bg-muted/50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">Consultation Status</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Doctor ID:</span> {peerId || 'Connecting...'}
          </div>
          <div>
            <span className="font-medium">Call Status:</span> {
              isCallActive ? (hasRemoteStream ? 'Connected' : 'Connecting...') : 'Ready'
            }
          </div>
          <div>
            <span className="font-medium">Camera:</span> {
              hasCameraPermission === null ? 'Loading...' : 
              hasCameraPermission ? 'Ready' : 'Access Denied'
            }
          </div>
          <div>
            <span className="font-medium">Patient Stream:</span> {
              hasRemoteStream ? 'Receiving' : 'Not Connected'
            }
          </div>
        </div>
      </div>
    </div>
  );
}