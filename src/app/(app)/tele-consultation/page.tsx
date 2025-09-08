"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Send, PhoneOff, Mic, Video, User, FileText, Camera, CheckCircle, Copy, Phone } from "lucide-react"
import Image from "next/image"
import Peer, { MediaConnection } from 'peerjs'

import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { teleConsultationSupport, type TeleConsultationSupportOutput } from "@/ai/flows/tele-consultation-support"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const formSchema = z.object({
  medicalHistory: z.string().min(1, "Required"),
  vitals: z.string().min(1, "Required"),
  labResults: z.string().min(1, "Required"),
  imagingResults: z.string().min(1, "Required"),
  preferredLanguage: z.string().min(1, "Required"),
});

// Generate random patient ID
const generatePatientId = () => `PT-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

export default function TeleConsultationPage() {
  const [summary, setSummary] = useState<TeleConsultationSupportOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  
  // PeerJS states
  const [peer, setPeer] = useState<Peer | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerIdInput, setRemotePeerIdInput] = useState<string>('');
  const [currentCall, setCurrentCall] = useState<MediaConnection | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  
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

  // Initialize PeerJS
  useEffect(() => {
    const initializePeer = () => {
      const patientId = generatePatientId();
      
      // Use free PeerJS cloud server instead of local server
      const newPeer = new Peer(patientId, {
        debug: 2,
        config: {
          'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      newPeer.on('open', (id) => {
        console.log('Patient Peer ID:', id);
        setPeerId(id);
        setIsConnected(true);
        showToast("Connected to Server", `Your Patient ID: ${id}`);
      });

      newPeer.on('call', (call) => {
        console.log('Receiving call from doctor:', call.peer);
        
        // Answer the call with local stream
        if (localStreamRef.current) {
          call.answer(localStreamRef.current);
          setCurrentCall(call);
          setIsCallActive(true);
          
          call.on('stream', (remoteStream) => {
            console.log('Received doctor video stream');
            setHasRemoteStream(true);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
              remoteVideoRef.current.play().catch(e => console.log('Remote video play error:', e));
            }
          });

          call.on('close', () => {
            console.log('Call ended by doctor');
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

          showToast("Doctor Connected!", "Video call started with Doctor");
        } else {
          console.error('No local stream available to answer call');
          showToast("Cannot Answer Call", "Camera not ready. Please refresh and try again.", "destructive");
        }
      });

      newPeer.on('error', (err) => {
        console.error('PeerJS error:', err);
        showToast("Connection Error", `Failed to connect: ${err.message}`, "destructive");
      });

      setPeer(newPeer);
    };

    initializePeer();

    return () => {
      if (peer) {
        peer.destroy();
      }
    };
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
        
        console.log('Patient camera ready');
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
    showToast("Copied!", "Patient ID copied to clipboard");
  };

  const makeCall = () => {
    if (!peer || !remotePeerIdInput || !localStreamRef.current) {
      showToast("Cannot Make Call", "Please ensure you're connected and have entered a doctor ID", "destructive");
      return;
    }

    console.log('Patient calling doctor:', remotePeerIdInput);
    const call = peer.call(remotePeerIdInput, localStreamRef.current);
    setCurrentCall(call);
    setIsCallActive(true);

    call.on('stream', (remoteStream) => {
      console.log('Received doctor video stream');
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
      showToast("Call Failed", "Could not connect to doctor. Please check the Doctor ID.", "destructive");
    });

    showToast("Calling Doctor...", `Connecting to Doctor ID: ${remotePeerIdInput}`);
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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      medicalHistory: "Patient has a history of hypertension and type 2 diabetes.",
      vitals: "BP 140/90 mmHg, Temp 98.6°F, HR 78 bpm",
      labResults: "Fasting blood sugar: 150 mg/dL, HbA1c: 7.2%",
      imagingResults: "Chest X-ray: Clear",
      preferredLanguage: "English",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setSummary(null);
    try {
      const result = await teleConsultationSupport(values);
      setSummary(result);
      showToast("Summary Generated", "Patient summary is ready for the consultation.");
    } catch (error) {
      console.error("Summary generation error:", error);
      showToast("Error", "Failed to generate summary. Please try again.", "destructive");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="Tele-Consultation Portal - Patient Interface" />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="grid gap-8 lg:grid-cols-2">
          
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="font-headline">Live Consultation - Patient Portal</CardTitle>
              <CardDescription>Connect with your doctor for a remote consultation.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              
              {/* Connection Status */}
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Patient Connection Status</AlertTitle>
                <AlertDescription>
                  {isConnected ? (
                    <div className="flex items-center gap-2">
                      <span>Ready - Share this Patient ID: <strong>{peerId}</strong></span>
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
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter doctor's ID to call (optional - doctor can call you)"
                    value={remotePeerIdInput}
                    onChange={(e) => setRemotePeerIdInput(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={makeCall} disabled={!remotePeerIdInput || !isConnected}>
                    <Phone className="h-4 w-4 mr-2" />
                    Call Doctor
                  </Button>
                </div>
              )}

              {/* Video Display */}
              <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-gray-900">
                {/* Main Video Area - Doctor's Video */}
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
                          {isCallActive ? 'Connecting to Doctor...' : 'Waiting for Doctor'}
                        </p>
                        <p className="text-sm text-gray-300">
                          {isCallActive ? 'Video call in progress' : 'Doctor will join using your Patient ID'}
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
                      🟢 {hasRemoteStream ? 'Doctor Connected' : 'Connecting...'}
                    </div>
                  )}

                  {hasRemoteStream && (
                    <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1 rounded text-sm">
                      Doctor's Video
                    </div>
                  )}
                </div>

                {/* Patient's Own Video - Picture-in-Picture */}
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

                  {/* Patient Label */}
                  <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    You (Patient)
                  </div>
                </div>
              </div>

              {/* Call Controls */}
              <div className="flex justify-center items-center gap-4">
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

              <Separator />
              
              {/* AI Summary Section */}
              <div className="flex-1 space-y-4">
                <h3 className="font-headline font-semibold flex items-center gap-2">
                  <FileText size={20}/> AI-Generated Summary for Doctor
                </h3>
                {summary ? (
                  <div className="p-4 bg-muted/50 rounded-lg text-sm max-h-48 overflow-y-auto">
                    <p>{summary.summary}</p>
                  </div>
                ) : (
                  <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground text-center">
                    Generate patient summary to share with your doctor during consultation.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <CardHeader>
                  <CardTitle className="font-headline">Generate Patient Summary</CardTitle>
                  <CardDescription>Fill this form to generate a summary for the doctor.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField control={form.control} name="medicalHistory" render={({ field }) => (
                    <FormItem><FormLabel>Medical History</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="vitals" render={({ field }) => (
                    <FormItem><FormLabel>Vitals</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="labResults" render={({ field }) => (
                    <FormItem><FormLabel>Lab Results</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="imagingResults" render={({ field }) => (
                    <FormItem><FormLabel>Imaging Results</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                   <FormField control={form.control} name="preferredLanguage" render={({ field }) => (
                    <FormItem><FormLabel>Preferred Language</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? (<Loader2 className="animate-spin" />) : (<Send className="mr-2" />)}
                    Generate & Send Summary
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </div>
      </main>
    </div>
  )
}