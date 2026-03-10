const DEPENDABLE: unique symbol = Symbol("vyft.dependable");
const MOUNTABLE: unique symbol = Symbol("vyft.mountable");
const LINKABLE: unique symbol = Symbol("vyft.linkable");

export { DEPENDABLE, LINKABLE, MOUNTABLE };

export interface Dependable {
  [DEPENDABLE]: true;
}

export interface Mountable<T = unknown> extends Dependable {
  [MOUNTABLE]: true;
  value: T;
}

export interface Linkable extends Dependable {
  [LINKABLE]: true;
}
