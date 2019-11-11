# *** Work in Progress ***
# Build and Deploy a sample app on Kubernetes using Tekton Pipeline

This tutorial takes you through the steps to deploy an application to Kubernetes Service on IBM Cloud. In this tutorial you learn the following concepts:
-	To deploy an application on IBM Kubernetes Service(IKS) using kubectl
-	To build and deploy application on IKS using Tekton Pipeline

## Pre-requisites

To complete this tutorial, you will need:

* An [IBM Cloud](https://cloud.ibm.com/login) account
* Get an instance of [Kubernetes Service on IBM Cloud](https://cloud.ibm.com/kubernetes/catalog/cluster). It will take ~20 minutes.
* Get the access of IKS through `kubectl` CLI using the instructions provided in access tab at:
  ```
  IBM Cloud Dashboard -> <your cluster> -> Access Tab
  ```
* Create (if not already) namespace on IBM Cloud container registry. It can be accessed at:
  ```
  IBM Cloud Dashboard -> Click on Navigation Menu -> Kubernetes -> Registry -> Namespaces
  ```
* Configure [Git CLI](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git). Clone the repository using the command below:
  ```
  git clone https://github.com/IBM/deploy-app-using-tekton-on-kubernetes.git
  ```
  
  > Note: You should clone this repository to your workstation since you need to edit some of the files before using them.
  
## Estimated Time
This tutorial takes about 40 minutes, after pre-requisites configuration.

## Section 1 - To build and deploy an application on Kubernetes Service using kubectl

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
  
  # To build and push it to IBM Cloud Container registry. Following command takes care of build and push to container registry and eliminates the overhead to run docker commands individually.
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

Get the public IP of Kubernetes Cluster on IBM Cloud and access the application on 32426 port as this port is used in deploy.yaml.
```
  http://<public-ip-of kubernetes-cluster>:32426/
```

Once application is deployed and you need to make any changes, then you have to re-run the steps again. In order to build, test, and deploy application faster and more reliably, need to automate the entire workflow. We should follow the modern development practices that is continuous integration and delivery (CI/CD) as it reduces the overhead of development and deployment process and saves significant time and effort.

## Section 2 - To build and deploy an application on Kubernetes Service using Tekton Pipeline

Tekton is a powerful and flexible Kubernetes-native open-source framework for creating CI/CD systems. It allows you build, test, and deploy across multiple cloud providers or on-premises systems by abstracting away the underlying implementation details. You can read more about [Tekton](https://github.com/tektoncd/pipeline). The high level concept of Tekton Pipeline can be explained as below.

The Tekton Pipeline project extends the Kubernetes API by following custom resource definitions (CRDs):
* tasks
* taskrun
* pipeline
* pipelinerun
* pipelineresource

`Tasks` describe individual jobs that can have inputs and outputs, so-called `pipelineresources`. With `taskrun` it is possible to execute a single task, which binds the inputs and outputs of the task to pipelineresources too. A `pipeline` describes a list of tasks and can also be executed by `pipelinerun`. Inputs and outputs are also bound to pipelineresources.

The steps explained in this section guide you to automate the application’s workflow for build and deploy using Tekton Pipeline.

**Add the Tekton Pipelines component to your Kubernetes cluster**
```
  kubectl apply --filename https://storage.googleapis.com/tekton-releases/latest/release.yaml
```

The installation creates two pods which can be checked using the following command and wait until pods are in running state. 
```
  kubectl get pods --namespace tekton-pipelines
```

More information is available [here](https://github.com/tektoncd/pipeline/blob/master/docs/install.md#adding-the-tekton-pipelines). You are now ready to create and run Tekton Pipelines. Let’s start creating the custom resources' definition.

**Create Pipeline Resource**

In this example, the source code of the application is available in github repository. Hence, need to create the pipeline resource to access the git repository. Here we can configure the url of github repository and the branch of the repository.
The complete YAML file is available at `tekton-pipeline/resources/git.yaml`. Apply the file to your cluster.

```
  cd tekton-pipeline
  kubectl apply -f resources/git.yaml
```

**Create Tasks**

Task resource defines the steps of the pipeline. Here we are creating two tasks as follows.

*Build-image-from-source*

This task will build, tag and push the docker image to the container registry. In this example Kaniko is used to build the image. There are other options also available for this purpose like buildah, podman etc.

```
  kubectl apply -f task/build-src-code.yaml
```

*Deploy-to-cluster*

Deploy an application on Kubernetes Service means deploy application as pod using the built container image in previous step and make it available as a service to access it from anywhere. This task will use the deploy.yaml. This task defines two steps:
  -	Update image URL in deploy.yaml
  -	Apply the configuration file on cluster using kubectl

Run as: 
```
  kubectl apply -f task/deploy-to-cluster.yaml
```

**Create Pipeline**

Pipeline custom resource lists the tasks to be executed and provides the input and output resources and input parameters required by each task. If there is any dependency between the tasks, that also can be addressed. In this example, we are using `runAfter` key to execute the tasks one after the another. Apply this configuration as:

```
  kubectl apply -f pipeline/pipeline.yaml
```

**Create PipelineRun**

All other required resources has been created now. To run the pipeline we need a PipelineRun custom resource definition. All required parameters will be passed from PipelineRun. PipelineRun will trigger Pipeline, further Pipeline will create TaskRuns and so on. In the similar manner parameters will be substituted to the corresponding task.

The important point to note here is that through pipeline we push images to registry and deploying into cluster, so we need to ensure that it has the sufficient and all required permissions to access container registry and the cluster. The credentials for the registry will be provided by a ServiceAccount. Hence, let us define a service account before executing Pipelinerun.

**Create Service Account**

To access the protected resources, need to setup a service account which uses secrets to create or modify Kubernetes resources. IBM Cloud Kubernetes Service is configured to use IBM Cloud Identity and Access Management (IAM) roles. These roles determine the actions that users can perform on IBM Cloud Kubernetes. 

*Generate API Key*

– To generate API key using IBM Cloud Dashboard, follow the instructions given [here](https://cloud.ibm.com/docs/iam?topic=iam-userapikey#create_user_key). Else, use the following CLI command to create API key.

```
  ibmcloud iam api-key-create MyKey -d "this is my API key" --file key_file.json
  cat key_file.json | grep apikey
```

*Create Secret* 

```
  kubectl create secret generic ibm-cr-secret --type="kubernetes.io/basic-auth" --from-literal=username=iamapikey --from-literal=password=<APIKEY>

  kubectl annotate secret ibm-cr-secret tekton.dev/docker-0=<REGISTRY>
```

where,
* < APIKEY > is the one that you created
* < REGISTRY > is the registry API endpoint for your cluster, for example us.icr.io 

It creates a secret named as `ibm-cr-secret` which will be used in configuration file for service account.

In this configuration file `serviceaccount.yaml`, serviceaccount resource uses the secret generated in previous step. For added security, we add the sensitive information in a Kubernetes Secret and populate the kubeconfig from them. As per the definition of Secret resource, the newly built secret is populated with an API token for the service account. Next section in configuration file, define roles. A Role can only be used to grant access to resources within a single namespace. Need to include appropriate resources and apiGroups in rules, then only it will work otherwise it will fail with access issues.
A role binding grants the permissions defined in a role to a user or set of users. It holds a list of subjects (users, groups, or service accounts), and a reference to the role being granted. 

```
  kubectl apply -f pipeline/service-account.yaml
```
**Run the Pipeline**

Modify `imageUrl` and `imageTag` in `pipeline/pipelinerun.yaml`. Refer `Setup Deploy Target` section above to decide on image URL and tag. If imageURL is *us.icr.io/test_namespace/builtApp* and image tag is *latest*, then update configuration file as:

```
  sed -i '' s#IMAGE_URL#us.icr.io/test_namespace/builtApp# pipeline/pipelinerun.yaml
  sed -i '' s#IMAGE_TAG#latest# pipeline/pipelinerun.yaml
```

Now, at the end run the pipeline.

```
  kubectl create -f pipeline/pipeline-run.yaml
```

It will create pipeline and you will get message on terminal as:
```
  pipelinerun.tekton.dev/application-pipeline-run created
```

To check the status of the pipeline created,
```
  kubectl describe pipelinerun application-pipeline-run
```

You may need to re-run this command till pipeline execution is not completed. It will show you interim status like:

```
Status:
  Conditions:
    Last Transition Time:  2019-11-11T06:51:06Z
    Message:               Not all Tasks in the Pipeline have finished executing
    Reason:                Running
    Status:                Unknown
    Type:                  Succeeded
  
   ...
   ...
   Events:              <none>
```

Once completed, you should see the following message on your terminal:

```
Status:
  Completion Time:  2019-11-07T09:41:59Z
  Conditions:
    Last Transition Time:  2019-11-07T09:41:59Z
    Message:               All Tasks have completed executing
    Reason:                Succeeded
    Status:                True
    Type:                  Succeeded
..
..
Events:
  Type     Reason             Age                From                 Message
  ----     ------             ----               ----                 -------
  Normal   Succeeded          0s                 pipeline-controller  All Tasks have completed executing
```

If it fails, then it shows which task has been failed and also give you more details to check logs. To know more details about any resource like pipeline, task then use following command to get more details.

```
  kubectl describe <resource> <resource-name>
```

**Verify Result**
To verify whether pod and service named as `app` is running, run the following commands:

```
  kubectl get pods
  kubectl get service
```

Get the public IP of Kubernetes Cluster on IBM Cloud and access the application on 32426 port as this port is used in deploy.yaml.
```
  http://<public-ip-of kubernetes-cluster>:32426/
```

## Summary

This tutorial covered the basics of Tekton Pipeline to get you started building your own pipelines. There are more features available. Try it out with IBM Cloud Kubernetes Service.







