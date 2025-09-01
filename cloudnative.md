{id=1}# Making Office documents “Cloud native”

{id=2}The document discusses the integration of Office 365, SharePoint, and OneDrive for storing Office documents in the cloud. It acknowledges that Office documents have not evolved significantly since Office 95, which limits innovation. The decision is made to support storing documents on third-party cloud services, providing a differentiating factor against Google. The document presents ideas for a cost-effective solution to support "cloud-native" documents with specific requirements for incremental loading, fast rendering of PowerPoint slides, and collaborative editing. It proposes a hot and cold storage approach, utilizing third-party storage providers for cold storage while optimizing hot storage for performance. Data is stored using APIs, and encryption is suggested to protect privacy. The document also addresses authentication challenges, particularly on iOS, and discusses the use of OAuth for access control. Additional mapping work is required in this scenario.

{id=3}The document discusses the integration of Office 365, SharePoint, and OneDrive for storing Office documents in the cloud. It highlights the lack of significant changes in Office documents since Office 95, limiting innovation. The decision is made to support storing documents on third-party cloud services, providing a differentiating factor against Google. The document proposes ideas for a cost-effective solution to support "cloud-native" documents with specific requirements for incremental loading, fast rendering of PowerPoint slides, and collaborative editing. It introduces the concept of hot and cold document storage, utilizing third-party providers for cold storage and optimizing hot storage for performance. The document also addresses the need for 3rd party API integration and authentication challenges.

{id=4}With Office 365, Sharepoint and Onedrive, Office documents can be stored in the cloud. Office applications automatically load and save documents to cloud services, handle collaboration etc. But despite such integration Office documents have not changed much since Office 95\. The document content is still stored as a single file which on one hand gives used flexibility for moving document content around but on the other hand limits our ability to innovate. 

{id=5}The ongoing change to remove Save button is an example of such complexity. We can relatively easy make things work when a document is stored in our cloud; it is a feasible task to improve our protocol with Onedrive/OnedrivePro to have similar perf characteristic as protocol used by GoogleDocs. Things get very complex when document is stored on a local drive, network attached storage or 3rd party cloud storage.

{id=77}One of the key decisions which we have to make is if we are going with Google model where a document can only exist in Google cloud or we provide support for storing documents on 3rd party cloud services. For this document I assume that we want to go with 3rd party integration model as it provides great differentiating factor against Google. 

{id=65}This document contains a collection of ideas on implementing cost effective solution for supporting “cloud native” documents with following requirements.

- The system should enable applications to implement incremental load of documents where the first screen is rendered faster than Web page with the same complexity  
  - PPT should be able to render the first slide in \<1 second regardless of deck size  
- The system should enable applications to perform collaborative editing with \<1 sec delay between endpoints  
  - The delay subject to payload size and network latencies  
- A document can be located on 3rd party storage  
  - 3rd party is has to use APIs (either client or server) provided by Microsoft to enable collaborative editing of Office documents.   
  - 3rd party work for integrating with APIs should be \<3 man month.

Hot and cold document storage

The first idea is to use separate the infrastructure for documents being actively edited (hot documents) and documents which are not changing. Based on Sharepoint telemetry data, 80% or more of documents are not edited after first few weeks; the percentage of documents edited or commented after few month is even smaller. 

Instead of either owning the permanent document storage (which is expensive for multiple reasons) or having frequent communication with storage provides (which adds unpredictability to protocol stack) we can completely own hot storage part and rely on 1st (Onedrive) or 3rd (Dropbox) party storage providers to provide cold storage. 

When a document is being edited, all data will first be stored in hot storage. This way we can guaranty that all data is persisted once we receive it. Lazily we will copy data (including all history) to cold storage using standard APIs implemented by storage providers. 

We can then optimize hot storage design to be cost effective for our access patterns. For example we can keep hot data in memory or on SSD. But the data in hot storage is not the primary location of the data. Once document become cold, we will remove all data related to the document from our storage.

There are two pieces of data which we are going to store via APIs exposed by storage providers.

- The current version of document in Office document XML format.  
- Complete document state which includes all history

Storage provider should look at latter part as an opaque blob (or series of blobs). It might be better to encrypt blob to Microsoft key to prevent storage provides from reverse engineering the format and to help storage provides with maintaining user’s privacy. Even if complete document state is leaked, the data is not going to be accessible outside Microsoft service.

3rd party authentication

The next issue is related to authentication. Office collaboration service needs a way to verify if a user A has access to document D1 and the level of access (read-only, read write etc). This information is managed in Dropbox cloud using Dropbox user identities. 

Unfortunately due to sandbox on iOS our options are pretty limited. If we had a way to pass date outside file from picker process to application process, we could use some form of token authentication.   
Without such support the only option seems to be OAuth based. Usually OAuth is used to authorize access on 3rd party services without sharing credentials. But our case is bit different since we do not actually own the source which means that Dropbox will have to transfer ACL list to us. To the best of my knowledge (which is minimal in this area) OAuth was designed in a way to hide the actual user identity from 3rd party service. In order for this to work, so we will have to do additional work for mapping.

In this model following sequence of event happens when a user open a file in Dropbox client

- Client sends “Open” signal to Dropbox passing information about file including the ID of the document. Request happens using OAuth credentials established between Dropbox client and server.  
  - Document ID can be a hash of the document of some information (GUID) stored in the document. Hash might be better as it reduces the privacy risk of using document ID as permanent cookie.  
- Dropbox finds file on the server and calls Office collaboration service to rehydrate the file (in case the file is in cold storage). Dropbox also passes ID of the user and hash of the document  
  - As mentioned earlier this might be tricky since the ID which Office collaboration service will be specific to our authentication.  
- Picker returns the document to Office application   
  - Application uses OAuth to authenticate user with Dropbox credentials. For 3rd party cloud providers we will show HTML UI.  
  - Sends request to Office collaboration service passing document hash as parameter  
- Office collaboration service validates identity and hash and either allows or denies the request.

# Log and cache separation

The next question is about efficient protocol between client and hot storage and efficient way to store data on the hot storage server. 

Today the protocol is based on passing document files via Cobalt with document shredded on the server and stored as blocks. This approach is clearly not efficient as it requires application and server to maintain XML document which can take many seconds to create. 

The interesting question is if we should use Cobalt interfaces directly or move to some other way for storing the document. I do not have enough information about Cobalt to comment on protocol complexity or implementation. My main concern is related to the fact that Cobalt does not have change history as a top level primitive. The history can be implemented on top of Cobalt as additional graph nodes but this limits the ability of storage system to optimize storage in a generic way. 

Few years ago I built a prototype of storing documents in Git style version control system. The prototype (Orh) is based on the Git idea of storing complete document state for each revision. The core of the system is content addressable storage; content is stored as immutable blobs addressable by SHA1 of content. Each document revision is stored as a tree of blobs. The simplest solution for the current documents is to store each file from the document zip container as a separate blob but an application can decide to store content in a different way. For each document revision there is a commit record pointing to parent revisions; commit records create an acyclic graph.

Git stores complete state for each revision. When an element in the tree changes, Git stores new blob for the element itself and new blobs for each parent node all the way to the root. It is possible to minimize the amount of data both on disk and on network by using differential compression, by doing so just shifts cost from storage to CPU. 

Git design works fine for source code where a checkin is an implicit action and the rate of checkins is relatively small. For documents we want to exchange individual actions (such as typed characters) between endpoints which mean high rate of changes. In such environment Git approach is going to be too costly. We can however adopt some ideas from Git and Cobalt to build a storage system (RevLog) targeted to document editing scenarios. 

RevLog design

There are two main ideas for RevLog design.   
The first idea is to represent a document as a stream of actions which are passed between endpoints. An action can contain arbitrary big data and in some cases just contain the complete document. The exact definition of actions is responsibility of an application and can change over time. Application can add new actions or deprecate existing actions. 

D \= A1 \-\> A2 \-\> A3 \-\> …. \-\> An

Each endpoint sends action stream to collaboration server where it is merged with action from other client. New actions are to the end of the stream which minimizes the cost of write operations. An application does not ever send the complete file to the server as long as client and server endpoints can agree on the state of the document.

If an older endpoint receives an action which it does not understand, it can request a complete state from server. We can potentially request state from any endpoint since the system is distributed but this might be too complex to setup.

Append only structure works great for writing the document but might require a lot of operations for reading. To avoid such overhead each endpoint can cache a version(s) of the document in some form. The exact implementation of cache is up to endpoint. Client endpoint can store document in mix of SQL / FS; server endpoint can choose to use different technologies such as memory cache or SSD. 

# Offline editing

A user might edit the document while device is offline, exit Office application and when connectivity is restored launch Dropbox application to sync edits with the server. 

The Dropbox client syncing the complete document D1 to the server is not going to help since the document does not contain action stream. As a result we might not be able to merge it. And even for single editing case we will lose change history which might be considered as data loss.

To solve this we are can store action stream in a separate file in dropbox client and requiring dropbox client to send file to Office collaboration service (either directly or through Dropbox service). The functionality of storing additional files is available in iOS sandbox (see [sandbox/related item](https://developer.apple.com/library/mac/documentation/Security/Conceptual/AppSandboxDesignGuide/AppSandboxInDepth/AppSandboxInDepth.html)); I am not sure about WinRT. Having logic would require modification of Sync clients but we will have to request modification anyway to prevent Sync client from sending/receiving the complete document file from server.

Dropbox client should treat change file as opaque blob. In order to prevent 3rd party from reverse engineering C1 format and improving privacy, we can keep C1 encrypted using asymmetric encryption with private key accessible only on server.

# Storage provider APIs

In order for things to work we will have to expose following APIs to storage providers and figure out server-server authentication story. 

I am assuming that the server endpoint is not going to be opened to general public and will require some sort of per-provider key. The technologies for such authentication are well understood and should not be a problem.

APIs are split into two parts: implemented by provider and by Microsoft. The goal is to keep APIs surface as small as possible on both sides.

## **Implemented by provider:**

- GetBlob   
  - Returns blob given blob ID  
- PutBlob  
  - Stores blob in provider, returns ID of the blob  
- DeleteBlob  
  - Deletes blob given blob ID   
- UpdateDocument  
  - Stores document under specific DocumentID  
- NotifyChanges  
  - Notifies about changes in one or more documents

## **Implemented by Office**

- PrepareDocument  
  - Takes DocumentID and optional list of users. Prepared  
- UpdateAccessList  
  - Takes DocumentID and list of users, updates list of users who can edit the document  
- EraseDocument  
  - Removes document cache from hot storage.

# Isomorphic open

One interesting technology being developer in JavaScript lang is [Isomorphic JavaScript](http://nerds.airbnb.com/isomorphic-JavaScript-future-web-apps/).  The main idea is to improve page load time by rendering initial page content on the server. Once initial page displayed, the browser can take time downloading full version of the page which might require seconds to load.

Since we want Office content to load as fast as Web pages we can use similar idea for Office documents. The server can cache initial pages of the document in the form which can be quickly send to the client. The format can be application dependent. For PowerPoint the server can just send the first slide and global styles to the server while Word might send PDF? 

# Rights management integration

One interesting feature which we can use as differentiator against Google is integration with rights management. Today collaboration over rights protected document does not work at all. With new storage we can keep documents encrypted the same way as today but use different encryption schema for internal representation of data and actions. 

In hot/cold storage world, we can design storage and protocol to keep all data encrypted end to end at all time. If a document does not have policy associated with it, the encryption can be done with a key available to anyone who has access to the document. For rights managed documents the key will be delivered from license service.

More investigation needed to define story of integration with 3rd party identities.

End of document

Similar situation with collaboration. Adding collaboration support to Office application has been a very slow and painful process. One of the key factor for such slowness was the file centric design of Office documents. When a user opens a document in our cloud Office applications use internal Office protocol to get the document content from the server. Today this protocol is quite heavy compared to GoogleDocs but it can be improved.

This document contains a collection of ideas on changing Office documents to use the full power of cloud.

Under construction start \>\>\>

Office file formats are one of the most recognizable formats in the world. They are used for exchange and archiving. Even GoogleDocs provides a function for export/import of documents into their system. 

But with great power comes great responsibility. Users expect things to work . The fact that Word is an application for viewing and editing DOCX file makes it hard for us to move our editing   
experience to new world.

app saves action stream  
when we work against local drive, we save in background the final document

key requirement. document on block storage does not contain history unless it is enabled via change tracking etc.

sharing over http url

Under construction end \>\>\>

# Collaborative editing for 3rd party cloud storage services.

The goal is to provide collaborative editing experience for document stored in 3rd party cloud storage services which is as good as experience in Microsoft cloud. Such integration is not going to be possible without 3rd party integrating with Microsoft SDKs and services on either client and server side. However one of the primary design goals is to keep the complexity of such integration to minimal to allow Microsoft to make changes to the infrastructure and client applications without waiting for 3rd party services.

The simplest option for implementing such integration is to use combination of file storage and Office collaboration service (FOCS). The diagram below includes main elements of the design for supporting both online and offline work. Since it is bit complex, I am going to split the diagram  per scenario starting with the simplest.

## **Single user online editing**

In this scenario a user selects file in dropbox while device is online. 

Open document:

- Dropbox application first tells dropbox service that it is about to start editing session.   
- Dropbox server pushes document D1 to Office collaboration service where it is stored in cloud format S1  
- Office collaboration service gives Dropbox a ticket T1 for accessing document  
- Dropbox server passes T1 to the client which passes document D1 and T1 to Office application  
- Office application creates it’s copy of S1 based on data from D1 and syncs the missing parts from Office collaboration service using ticket T1 for authentication

Saving document:

- Office application pushes data to Microsoft service in realtime  
- Office collaboration service pushes notification to Dropbox service so it can update D1  
- Similar the case of local document, Office application does periodic save of D1 to Dropbox client so the document is available in file form  
  - Office app would only show “saved” status after the document is saved in Dropbox client.   
  - Having such delay would be one of the major difference between working against Dropbox and Microsoft cloud.

In this system dropbox client should never upload file back to the server. Updated version of D1 will be available to Dropbox service directly from Office collaboration service. Dropbox might need to download fresh copy of D1 to the client if D1 was edited by other devices.

## **Multi user online collaboration**

When document is shared, Dropbox service would request a separate ticket for each user. Office collaboration service will use ticket data to differentiate between edits coming from different users.

## **Sync of collaborative document**

An Office application might not be running when collaboration is happening. However when a user opens a document on the endpoint, we would like to present the user with the most up-to-date version of the document even if endpoint is offline at the time.

A Dropbox service can push a complete document file for every change to the endpoint but this is not practical. Instead Dropbox service can request a patch file from the Office collaboration service. A patch file contains delta for converting D1 document to the latest D1’ state. To perform the transformation, Dropbox client has to run JavaScript code provided by Microsoft on the client device. 

Using JavaScript on the client would allow us to change patch logic without requiring application update. The choice of JavaScript is driven by two factors. First of all JavaScript is the only language which an application is allowed to download and execute on iOS. Second JavaScript is available on all platforms and relatively fast. 

Using patch based protocol is not ideal from bandwidth perspective but should allow great reduction of bandwidth in many cases. 

## **Storing revisions, cold storage**

To support collaborative editing Office collaboration service needs access to the current document data as well as all previous revisions. We can only provide seamless merge for clients which share the common base revision.

The question become on how long we want to keep the document data in our cloud. Dependent on agreement with Dropbox and our business needs we can either store the document indefinitely (potentially in encrypted form) or treat our data as cache. 

In the latter case we will have to define a format and protocol for transferring revision data back to Dropbox for permanent storage.

It might be interesting to look at our internal infrastructure in a similar way. Based on telemetry data, 80% or more of documents are not edited after first few weeks which means that it might be beneficial to separate hot documents from cold documents. Dropbox (as well as our internal store) become cold storage. Office collaboration service is hot storage which can be built using different technology like using SSD.

# Collaborative editing over network storage

TBD

