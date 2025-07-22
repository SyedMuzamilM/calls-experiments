import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMediasoupClient } from "../hooks/useMediasoupClient";
import MediaControls from "../components/MediaControls";
import Player from "../components/Player";
import type { Device } from "mediasoup-client";
import { Button } from "../components/ui/button";
import type { Producer } from "mediasoup-client/types";

interface UserStreams {
  camera?: MediaStream;
  screenshare?: MediaStream;
}

const RoomPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    joinRoom,
    loadDevice,
    createSendTransport,
    createRecvTransport,
    produce,
    // localStream,
    // setLocalStream, // Make sure this exists in the hook
    connected,
    socket,
    consume,
    deviceRef,
  } = useMediasoupClient();

  const [roomId, setRoomId] = useState(searchParams.get("room") || "");
  const [joined, setJoined] = useState(false);
  const consumedProducersRef = useRef<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, UserStreams>
  >({});

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenShareStream, setScreenShareStream] =
    useState<MediaStream | null>(null);
  const [screenProducer, setScreenProducer] = useState<Producer | null>(null);

  const localProducersRef = useRef<Record<string, Producer | null>>({
    camera: null,
    mic: null,
    screenshare: null,
    screen: null,
  });

  const consumeAndAddTrack = useCallback(
    async ({
      producerId,
      userId,
      kind,
      appData,
      device,
    }: {
      producerId: string;
      userId: string;
      kind: "audio" | "video";
      appData?: Record<string, any>;
      device: Device;
    }) => {
      if (consumedProducersRef.current.has(producerId)) return;

      await consume(
        producerId,
        device.rtpCapabilities,
        (stream: MediaStream) => {
          consumedProducersRef.current.add(producerId);

          const [newTrack] = stream.getTracks();
          const source =
            appData?.source === "screenshare" ? "screenshare" : "camera";

          // En vez de añadir el track al mismo MediaStream, añadimos el nuevo stream al array
          setRemoteStreams((prevStreams) => {
            const newStreams = { ...prevStreams };
            if (!newStreams[userId]) {
              newStreams[userId] = {};
            }

            if (!newStreams[userId][source]) {
              newStreams[userId][source] = new MediaStream();
            }

            newStreams[userId][source]!.addTrack(newTrack);

            return { ...newStreams };
          });
        },
      );
    },
    [consume],
  );

  const handleUserLeft = ({ userId }: { userId: string }) => {
    setRemoteStreams((prevStreams) => {
      const newStreams = { ...prevStreams };
      if (newStreams[userId]) {
        Object.values(newStreams[userId]).forEach((stream) => {
          stream?.getTracks().forEach((track) => track.stop());
        });
        delete newStreams[userId];
      }
      return newStreams;
    });
  };

  useEffect(() => {
    if (!socket || !joined) return;

    const currentDevice = deviceRef.current;
    if (!currentDevice) return;

    const handleNewProducer = async ({
      producerId,
      userId,
      kind,
      appData,
    }: any) => {
      await consumeAndAddTrack({
        producerId,
        userId,
        kind,
        appData,
        device: currentDevice,
      });
    };

    socket.on("newProducer", handleNewProducer);
    socket.on("userLeft", handleUserLeft);

    return () => {
      socket.off("newProducer", handleNewProducer);
      socket.off("userLeft", handleUserLeft);
    };
  }, [socket, joined, consumeAndAddTrack, deviceRef]);

  const handleJoin = async () => {
    if (!roomId || !socket) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      setCameraStream(stream);

      const { producers: existingProducers } = await joinRoom(roomId);
      setSearchParams({ room: roomId });

      const rtpCapabilities = await new Promise((resolve) => {
        socket.emit("getRouterRtpCapabilities", {}, resolve);
      });

      const mediasoupDevice = await loadDevice(rtpCapabilities as any);
      await createSendTransport();
      await createRecvTransport();
      const camProducers = await produce(stream, { source: "camera" });
      camProducers.forEach((p) => {
        if (p.kind === "video") localProducersRef.current.camera = p;
        if (p.kind === "audio") localProducersRef.current.mic = p;
      });

      setJoined(true);

      for (const { producerId, userId, kind, appData } of existingProducers) {
        await consumeAndAddTrack({
          producerId,
          userId,
          kind,
          appData,
          device: mediasoupDevice,
        });
      }
    } catch (error) {
      console.error("Error joining room:", error);
      setJoined(false);
      setSearchParams({});
    }
  };

  const handleStartScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      setScreenShareStream(stream);

      const screenshareProducer = await produce(stream, {
        source: "screenshare",
      });

      const videoProducer = screenshareProducer.find((p) => p.kind === "video");

      if (videoProducer) {
        localProducersRef.current.screen = videoProducer;

        stream.getVideoTracks()[0].onended = () => {
          handleStopScreenShare();
        };
      }
    } catch (error) {
      console.error("Error starting screen share:", error);
      setScreenStream(null);
    }
  };

  const handleStopScreenShare = () => {
    const screenProducer = localProducersRef.current.screen;
    if (!screenProducer) return;

    console.log("Stopping screen share");

    // notify mediasoup to close the producer
    screenProducer.close();
    localProducersRef.current.screen = null;

    screenShareStream?.getTracks().forEach((track) => track.stop());
    setScreenShareStream(null);
  };

  const handleLeaveRoom = () => {
    if (!socket) return;

    socket.emit("leaveRoom");
    setJoined(false);
    setSearchParams({});
    window.location.reload();
    navigate("/");
  };

  return (
    <div className="flex flex-col items-center gap-4 mt-8">
      {!joined ? (
        <div className="flex flex-col gap-2">
          <input
            className="border p-2 rounded"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <Button onClick={handleJoin} disabled={!connected || !roomId}>
            Join Room
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={handleLeaveRoom}>
              Leave Room
            </Button>
            <Button
              variant="outline"
              onClick={() => console.log({ remoteStreams, socket })}
            >
              Debug
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {cameraStream && (
              <Player stream={cameraStream} name="You (Camera)" you />
            )}
            {screenShareStream && (
              <Player stream={screenShareStream} name="You (Screen)" you />
            )}
            {Object.entries(remoteStreams).map(([userId, userStreams]) => (
              <>
                {userStreams.camera && (
                  <Player
                    key={`${userId}-camera`}
                    stream={userStreams.camera}
                    name={`User ${userId} (Camera)`}
                    you={false}
                  />
                )}
                {userStreams.screenshare && (
                  <Player
                    key={`${userId}-screen`}
                    stream={userStreams.screenshare}
                    name={`User ${userId} (Screen)`}
                    you={false}
                  />
                )}
              </>
            ))}
          </div>
        </>
      )}
      {joined && cameraStream && (
        <MediaControls
          localStream={cameraStream}
          isScreenSharing={!!screenShareStream}
          onStartScreenSharing={handleStartScreenShare}
          onStopScreenSharing={handleStopScreenShare}
          // produce={produce}
          // joined={joined}
        />
      )}
    </div>
  );
};

export default RoomPage;
