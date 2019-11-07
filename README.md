# *** Work in Progress ***
# Build and Deploy a sample app on Kubernetes using Tekton Pipeline

This tutorial will talk about the steps to be followed to deploy an application to Kubernetes without using tekton pipelines and using tekton pipelines. In this tutorial you learn the following concepts:
-	To deploy an application on IBM Kubernetes Service(IKS) using kubectl
-	To build and deploy application on IKS using Tekton Pipeline

## Pre-requisites
* IBM Cloud account
* IBM Kubernetes Service on IBM Cloud
* Environment setup to access IKS through `kubectl` CLI 
* Private container registry in IBM Cloud container registry – if does not exist. It can be accessed as:
  ```
  IBM Cloud Dashboard -> Kubernetes -> Registry
  ```
* Git CLI. Clone the repository using the command below:
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





