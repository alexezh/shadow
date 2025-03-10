import { ProcessedBuckets } from './processed-buckets.js';
import { SlideWindow } from './slide-window.js';
import { Quartiles } from './quartiles.js';

export var processBuckets = (function () {

    var ARRAY_BUCKET_SIZE = 256;

    var buildProcessedBuckets = function (dataLength, bucketArray, checksum) {
        var quartiles = new Quartiles(bucketArray);
        return new ProcessedBuckets(checksum, bucketArray, dataLength, quartiles);
    };

    var process = function (data) {
        var length = data ? data.length : 0;

        var bucketArray = Array.apply(null, Array(ARRAY_BUCKET_SIZE)).map(Number.prototype.valueOf, 0);
        var checksum;
        var slideWindow = new SlideWindow();

        var that = this;

        var populateBucket = function (hash) {
            if (!bucketArray[hash]) {
                bucketArray[hash] = 1;
            } else {
                bucketArray[hash]++;
            }
        };

        for (var i = 0; i < length; i++) {
            var code = data.charCodeAt(i);

            var startWindow = slideWindow.getPivot();
            slideWindow.put(code);

            checksum = slideWindow.getChecksum(startWindow, checksum);
            slideWindow.getTripletHashes(startWindow).forEach(populateBucket);
        }

        return buildProcessedBuckets(length, bucketArray, checksum);
    };

    return process;
})();
