import { calculatePearsonHash } from './pearson-hash.js';

export function Triplet(c1, c2, c3, salt) {
	this.c1 = c1;
	this.c2 = c2;
	this.c3 = c3;
	this.salt = salt;
};

Triplet.prototype.getHash = function () {
	return calculatePearsonHash([this.salt, this.c1, this.c2, this.c3]);
};
