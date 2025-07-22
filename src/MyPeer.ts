import {
  Consumer,
  DataConsumer,
  DataProducer,
  Producer,
  Transport,
} from "mediasoup/node/lib/types";

export type ProducerSource = "mic" | "webcam" | "screen";

export type MyProducer = {
  id: string; // Producer ID
  source: ProducerSource;
  producer: Producer;
  paused: boolean;
};

export type MyConsumer = {
  id: string; // Consumer ID
  peerId: string;
  producerId: string;
  consumer: Consumer;
};

export type MyPeer = {
  id: string;
  displayName: string;
  device: any;

  connectionState: "new" | "connecting" | "connected" | "disconnected";

  sendTransport: Transport | null;
  recvTransport: Transport | null;

  producers: Map<string, MyProducer>;
  consumers: Map<string, MyConsumer>;
};
