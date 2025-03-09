import { processBuckets } from './buckets/bucket-processor.js';
import { InsufficientComplexityError } from './errors/insufficient-complexity-error.js';

export function tlsh(data) {
    var processedBuckets = processBuckets(data);

    if (processedBuckets.isProcessedDataTooSimple()) {
        throw new InsufficientComplexityError("Input data hasn't enough complexity");
    }

    return processedBuckets.buildDigest().toString();
};