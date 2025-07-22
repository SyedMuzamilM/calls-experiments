import { MyPeer } from "../MyPeer";

export const closePeer = (state: MyPeer) => {
  state.producers?.forEach((p) => p.producer.close());
  state.recvTransport?.close();
  state.sendTransport?.close();
  state.consumers.forEach((c) => c.consumer.close());
};
