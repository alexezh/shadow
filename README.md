Shadow is an experimental framework for predicting user actions in complex environment such as editors

For instance, let's say we have code which can format text. A lot of users first write text and then format, so we probably want to delay formatting suggestion until a user stopped. But then how do you define "stop"

Shadow manages all such plugins as a graph of "agents" (for lack of better word) and provides a common framework for modelling and training state.
