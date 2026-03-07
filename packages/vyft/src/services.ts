import { createProvider, defineResource } from "@vyft/provider";

export interface NatsArgs {
  version?: string;
  jetstream?: boolean;
}

export interface RabbitmqArgs {
  version?: string;
  vhost?: string;
}

const natsResource = defineResource<NatsArgs>("nats", {});
const rabbitmqResource = defineResource<RabbitmqArgs>("rabbitmq", {});

const services = createProvider({
  name: "services",
  context: () => ({}),
  resources: {
    nats: natsResource,
    rabbitmq: rabbitmqResource,
  },
});

export const { nats, rabbitmq } = services;
