import { Body } from './body.js';
import { Checksum } from './checksum.js';
import { Digest } from './digest.js';
import { LValue } from './lvalue.js';
import { Q } from './q.js';

import { swap } from './byte-swapper.js';

export function DigestHashBuilder() {

    var CODE_SIZE = 32;

    var checksum;

    var lValue;

    var q;

    var body;

    var withHash = function (hash) {
        var digestData = fromHex(hash);
        var i = 0;

        withChecksumData(digestData[i++]);
        withLValueData(digestData[i++]);
        withQData(digestData[i++]);
        withBodyData(getBodyData(digestData, i));

        return this;
    };

    var build = function () {
        return new Digest(checksum, lValue, q, body);
    };

    var fromHex = function (str) {
        var result = new Array(str.length / 2);

        for (var i = 0; i < str.length; i += 2) {
            result[i / 2] = parseInt(str.substring(i, i + 2), 16);
        }

        return result;
    };

    var withChecksumData = function (data) {
        checksum = new Checksum([swap(data)]);
    };

    var withLValueData = function (data) {
        lValue = new LValue([swap(data)]);
    };

    var withQData = function (data) {
        q = new Q([swap(data)]);
    };

    var withBodyData = function (data) {
        var bodyData = new Array(data.length);

        for (var j = 0; j < data.length; j++) {
            bodyData[j] = (data[data.length - 1 - j]);
        }

        body = new Body(bodyData);
    };

    var getBodyData = function (data, from) {
        return data.slice(from, data.length);
    };

    return {
        withHash: withHash,
        build: build
    };
};

