import * as tf from "@tensorflow/tfjs";

// Define a small vocabulary
const vocabSize: number = 5;

// Convert words to one-hot encoded vectors
function oneHotEncode(index: number, vocabSize: number): number[] {
  const arr: number[] = new Array(vocabSize).fill(0);
  arr[index] = 1;
  return arr;
}

const inputData: number[][] = [
  [1, 2, 3],
  [3, 2, 0],
  [4, 2, 2],
]
const outputData: number[][] = [
  [4],
  [1],
  [0],
]
//const inputData: number[][] = words.map(word => oneHotEncode(wordToIndex[word], vocabSize));
//const outputData: number[][] = inputData; // Example: autoencoder-like training

// build
// Define a Sequential Model
const model = tf.sequential();

// Embedding layer to map one-hot vectors to dense embeddings
model.add(tf.layers.embedding({
  inputDim: vocabSize,  // Number of unique words
  outputDim: 3,         // Size of embedding vector
  inputLength: 1        // One word at a time
}));

// Flatten layer to make output suitable for a dense layer
model.add(tf.layers.flatten());

// Compile the model
model.compile({
  optimizer: "adam",
  loss: "meanSquaredError"
});

model.summary();

//const xs = tf.tensor2d(inputData, [vocabSize, vocabSize]); // Input (one-hot)
const xs = tf.tensor2d(words.map((_, i) => [i]), [vocabSize, 1]);
const ys = xs // tf.tensor2d(outputData, [vocabSize, vocabSize]); // Output (target)

async function trainModel(): Promise<void> {
  await model.fit(xs, ys, {
    epochs: 100,
    batchSize: 2,
    callbacks: {
      onEpochEnd: (epoch, logs) => console.log(`Epoch ${epoch}: loss = ${logs?.loss}`)
    }
  });
}

trainModel().then(() => {
  console.log("Training complete!");

  // Extract and print embeddings
  const embeddingLayer = model.layers[0] as any;
  const embeddings = embeddingLayer.getWeights()[0]; // Get embedding matrix
  embeddings.print(); // Prints learned embeddings
});

async function getWordEmbedding(word: string): Promise<void> {
  const index = wordToIndex[word];
  if (index === undefined) {
    console.log("Word not found!");
    return;
  }

  const indexTensor = tf.tensor2d([index], [1, 1]);
  const embedding = model.predict(indexTensor) as tf.Tensor;
  embedding.print();
}

getWordEmbedding("apple");
