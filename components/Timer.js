import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const Timer = ({ recipe, goBack, editRecipe, removeRecipe, cancelForm}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [remainingTime, setRemainingTime] = useState(recipe.steps[currentStep].duration);
  const [timerActive, setTimerActive] = useState(false);
  const [finishedSteps, setFinishedSteps] = useState([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let interval;
    if (timerActive && remainingTime > 0) {
      interval = setInterval(() => {
        setRemainingTime(remainingTime - 1);
      }, 1000);
    } else if (timerActive && remainingTime === 0) {
      setTimerActive(false);
      setFinishedSteps([...finishedSteps, currentStep]);
      if (currentStep < recipe.steps.length - 1) {
        setCurrentStep(currentStep + 1);
        setRemainingTime(recipe.steps[currentStep + 1].duration);
        if (recipe.steps[currentStep].autoTransition) {
          setTimerActive(true);
        }
      }
    }

    return () => clearInterval(interval);
  }, [timerActive, remainingTime, currentStep, recipe.steps, finishedSteps]);

  const toggleTimer = () => {
    setTimerActive(!timerActive);
  };

  const resetTimer = () => {
    setRemainingTime(recipe.steps[currentStep].duration);
    setTimerActive(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{recipe.name}</Text>
      {recipe.steps.map((step, index) => (
        <Text
          key={index}
          style={[
            styles.step,
            {
              textDecorationLine: finishedSteps.includes(index) ? 'line-through' : 'none',
              fontWeight: index === currentStep ? 'bold' : 'normal',
            },
          ]}
        >
          Step {index + 1}: {step.description} ({step.duration} seconds)
        </Text>
      ))}
      <Text style={styles.step}>{recipe.steps[currentStep].description}</Text>
      <TouchableOpacity onPress={() => editRecipe(recipe)} style={styles.button}>
        <Text style={styles.buttonText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => removeRecipe(recipe)} style={styles.button}>
        <Text style={styles.buttonText}>Remove</Text>
      </TouchableOpacity>
      <Text style={styles.time}>{remainingTime}s</Text>
      <TouchableOpacity style={styles.button} onPress={toggleTimer}>
        <Text style={styles.buttonText}>{timerActive ? 'Pause' : 'Start'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={resetTimer}>
        <Text style={styles.buttonText}>Reset</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={goBack} style={styles.button}>
        <Text style={styles.buttonText}>Go back</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    marginBottom: 16,
  },
  step: {
    fontSize: 20,
    marginBottom: 8,
  },
  time: {
    fontSize: 48,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#007bff',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default Timer;
