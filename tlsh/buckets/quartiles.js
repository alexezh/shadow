export var Quartiles = function (data) {
    if (data.length < ARRAY_SAMPLE_SIZE) throw new Error();

    var ARRAY_SAMPLE_SIZE = 128;

    var Q_RATIO_MODULE = 16;

    var sampleArray = data.slice(0, ARRAY_SAMPLE_SIZE).sort(function (a, b) {
        return (a - b);
    });

    let res = {
        getFirst: function () {
            return sampleArray[ARRAY_SAMPLE_SIZE / 4 - 1];
        },

        getSecond: function () {
            return sampleArray[ARRAY_SAMPLE_SIZE / 2 - 1];
        },

        getThird: function () {
            return sampleArray[ARRAY_SAMPLE_SIZE - (ARRAY_SAMPLE_SIZE / 4) - 1];
        }
    }

    res.getQ1Ratio = function () {
        return Math.floor(res.getFirst() * 100 / res.getThird()) % Q_RATIO_MODULE;
    };

    res.getQ2Ratio = function () {
        return Math.floor(res.getSecond() * 100 / res.getThird()) % Q_RATIO_MODULE;
    };
    return res;
};
