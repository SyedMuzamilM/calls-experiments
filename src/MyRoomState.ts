import {
  AudioLevelObserver,
  Router,
  RtpCapabilities,
  Worker,
} from "mediasoup/node/lib/types";
import { MyPeer } from "./MyPeer";

export type Then<T> = T extends PromiseLike<infer U> ? U : T;

export type MyRoomState = Record<string, MyPeer>;

export type MyRoom = {
  id: string; // Unique identifier for the room
  worker: Worker;
  router: Router;
  audioLevelObserver: AudioLevelObserver;
  peers: MyRoomState;
};

export type MyRooms = Record<string, MyRoom>;
