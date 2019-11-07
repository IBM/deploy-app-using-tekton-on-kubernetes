# *** Work in Progress ***
# Build and Deploy a sample app on Kubernetes using Tekton Pipeline

This tutorial will talk about the steps to be followed to deploy an application to Kubernetes without using tekton pipelines and using tekton pipelines. In this tutorial you learn the following concepts:
-	To deploy an application on IBM Kubernetes Service(IKS) using kubectl
-	To build and deploy application on IKS using Tekton Pipeline

## Pre-requisites
* [IBM Cloud](https://cloud.ibm.com/login) account
* [Kubernetes Service on IBM Cloud](https://cloud.ibm.com/kubernetes/catalog/cluster)
* Environment setup to access IKS through `kubectl` CLI 
* Create private container registry on IBM Cloud container registry – if does not exist. It can be accessed as:
  ```
  IBM Cloud Dashboard -> Click on Navigation Menu -> Kubernetes -> Registry -> Namespaces
  ```
* Configure [Git CLI](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git). Clone the repository using the command below:
  ```
  git clone <>
  ```
  
  > Note: You should clone this repository to your workstation since you will need to edit some of the files before using them.
  
## Estimated Time
This tutorial takes about 30 minutes, after pre-requisites configuration.

## Section1 - To deploy an application on IKS using kubectl

Once application code is completed, the following are the steps which we perform usually to build and deploy an application on Kubernetes cluster. 
-	Build the container image using Dockerfile
-	Push the built container image to the accessible container registry
-	Create a Kubernetes deployment from the image and deploy the application to an IBM Cloud Kubernetes Service cluster using configuration(yaml) files. The configuration files contain instructions to deploy the container image of application in Pod and then expose it as service.

If you are not using any automated way of CI/CD, then you will be doing all above-mentioned tasks manually as follows. 

**Setup deploy target**

You need to set the correct deploy target for docker image. Depending on the region you have created your cluster in, your URL will be in the following format:
```
  <REGION_ABBREVIATION>.icr.io/<YOUR_NAMESPACE>/<YOUR_IMAGE_NAME>:<VERSION>
```

The following command tells you the Registry API endpoint for your cluster. You can get region abbreviation from the output.
```
   ibmcloud cr api
```
To get namespace use the following command:
```
   ibmcloud cr namespaces
```
For example, deploy target for US-South region will be:
```
   us.icr.io/namespace-name/image-name:image-tag
```

**Deploy the application** - Run the following commands.

```
  cd <downloaded-source-code-repository>
  
  # To build and push it to IBM Cloud Container registry. Following command takes care of build and push to container registry and eliminates the overhead to run docker commands individually
  ibmcloud cr build -t us.icr.io/test_s1/testapp:1.0 .
  
  # To verify whether the image is available in container registry
  ibmcloud cr images 
  
  #update image path in deploy.yaml
  sed
  
  # run deploy configuration
  kubectl create -f deploy.yaml 
  
  # To verify result
  kubectl get pods
  kubectl get service
```

Get the public IP of Kubernetes Cluster on IBM Cloud and access the application.
```
  https://<public-ip-of kubernetes-cluster>:32426/
```

Once application is deployed and you need to make any changes, then you have to re-run the steps again. In order to build, test, and deploy application faster and more reliably, need to automate the entire workflow. We should follow the modern development practices that is continuous integration and delivery (CI/CD) as it reduces the overhead of development and deployment process and saves significant time and effort.

## Section2 - To build and deploy an application on Kubernetes Service using Tekton Pipeline

Tekton is a powerful and flexible Kubernetes-native open-source framework for creating CI/CD systems. It allows you build, test, and deploy across multiple cloud providers or on-premises systems by abstracting away the underlying implementation details. You can read more about [Tekton](https://github.com/tektoncd/pipeline). The high level concept of Tekton Pipeline can be explained as below.

The Tekton Pipeline project extends the Kubernetes API by five additional custom resource definitions (CRDs):
* tasks
* taskrun
* pipeline
* pipelinerun
* pipelineresource

`Tasks` describe individual jobs that can have inputs and outputs, so-called `pipelineresources`. With `taskrun` it is possible to execute a single task, which binds the inputs and outputs of the task to pipelineresources too. A `pipeline` describes a list of tasks and can also be executed by `pipelinerun`. Inputs and outputs are also bound to pipelineresources.

The following steps explained in this section will guide you to automate the application’s workflow for build and deploy using Tekton Pipeline.

* Add the Tekton Pipelines component to your Kubernetes cluster
```
  kubectl apply --filename https://storage.googleapis.com/tekton-releases/latest/release.yaml
```

The installation creates two pods which can be checked using the following command and wait until pods are in running state. 
```
  kubectl get pods --namespace tekton-pipelines
```

More information is available at [here](https://github.com/tektoncd/pipeline/blob/master/docs/install.md#adding-the-tekton-pipelines). You are now ready to create and run Tekton Pipelines. Let’s start creating the custom resources' definition.

* Create Pipeline Resource

In this example, the source code of your application is available in github repository. Hence, need to create the pipeline resource to access the git repository. Here we can configure the url of github repository and the branch of the repository.
The complete YAML file is available at `tekton-pipeline/resources/git.yaml`. Apply the file to your cluster.

```
  cd tekton-pipeline
  kubectl apply -f resources/git.yaml
```

* Create Tasks

Task resource defines the steps of the pipeline. Here we are creating two tasks as follows.

**Build-image-from-source**

This task will build, tag and push the docker image to the container registry. In this example Kaniko is used to build the image. There are other options also available for this purpose like buildah, kaniko etc. More details are available at <>.

```
  kubectl apply -f task/build-src-code.yaml
```

**Deploy-to-cluster**

Deploy an application on IKS means deploy application as pod using the built container image in previous step and make it available as a service to access it from anywhere. This task will use the deploy.yaml available at <>. This task defines two steps – 
  -	Update image URL
  -	Apply the configuration file using kubectl

Run as: 
```
  kubectl apply -f task/deploy-to-cluster.yaml
```

* Create Pipeline

Pipeline custom resource lists the tasks to be executed and provides the input and output resources and input parameters required by each task. If there is any dependency between the tasks, that also can be addressed. In this example, we are using `runAfter` key to execute the tasks one after the another. Apply this configuration as:

```
  kubectl apply -f pipeline/pipeline.yaml
```

* Create Pipeline Run

All other required resources has been created now. To start executing the pipeline we need a PipelineRun custom resource definition. All required parameters will be passed from PipelineRun. It will trigger Pipeline, Pipeline will trigger Task and so on and hence parameters will be passed to the corresponding task. To execute the pipeline, all resources must be created first, and then the pipelinerun can be executed. 

The important point to note here is that through pipeline we push images to registry and deploying into cluster, so we must ensure that pipeline has the sufficient and all required permissions to access container registry and the cluster. The credentials for the registry will be provided by a ServiceAccount. Hence, let us define a service account before executing PipelineRun.

* Create Service Account

To access the protected resources, need to setup a service account which uses secrets to create or modify Kubernetes resources. IBM Cloud Kubernetes Service is configured to use IBM Cloud Identity and Access Management (IAM) roles. These roles determine the actions that users can perform on IBM Cloud Kubernetes. 

**Generate API Key**

– To generate API key using IBM Cloud Dashboard, follow the insrtuctions given [here](https://cloud.ibm.com/docs/iam?topic=iam-userapikey#create_user_key). Else, you can use the following CLI command to create API key.

```
  ibmcloud iam api-key-create MyKey -d "this is my API key" --file key_file.json
  cat key_file.json | grep apikey
```

**Create Secret** 

```
  kubectl create secret generic ibm-cr-secret --type="kubernetes.io/basic-auth" --from-literal=username=iamapikey --from-literal=password=<APIKEY>

  kubectl annotate secret ibm-cr-secret tekton.dev/docker-0=<REGISTRY>
```

where -

- < APIKEY > is the API key that you created
- < REGISTRY > is the URL of your container registry, for example us.icr.io 

It creates a secret named as ‘ibm-cr-secret’ which will be used in configuration file.

In this configuration file, define ServiceAccount resource which uses the secret generated in previous step. For added security, we add the sensitive information in a Kubernetes Secret and populate the kubeconfig from them. As per the definition of Secret resource, the newly built secret is populated with an API token for the service account. Next section in configuration file, define roles. A Role can only be used to grant access to resources within a single namespace. Need to include appropriate resources and apiGroups in rules, then only it will work else it will fail with some access error.
A role binding grants the permissions defined in a role to a user or set of users. It holds a list of subjects (users, groups, or service accounts), and a reference to the role being granted. 

```
  kubectl apply -f pipeline/service-account.yaml
```

Now, at the end run the pipeline.

```
  kubectl create -f pipeline/pipeline-run.yaml
```











