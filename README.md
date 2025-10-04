Shadow is an experimental framework for an AI-first editor designed around formatting and semantic extraction. It is inspired by work I've done in [foolpy](https://github.com/alexezh/foolpy) focusing on off-the-shelf models. 

# Formatting as Semantic

Formatting is not only visual but also conveys meaning. By linking formatting to semantic intent, Shadow can recognize when a specific semantic element appears in another document and apply consistent formatting automatically.

# Semantic-Driven Editing

Shadow identifies and extracts structural and semantic details from existing documents, then leverages that knowledge to guide editing, ensuring both semantic clarity and stylistic consistency. 

For instance, if a user consistently creates tables with a blue header, Shadow will recognize this as a stylistic pattern and automatically apply the same design when the user inserts a new table. Similarly, when a user drafts a document that is semantically similar to one already in the library, Shadow can reuse the corresponding layout to maintain coherence and efficiency.

